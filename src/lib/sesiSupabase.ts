// Adapter autentikasi ke Supabase Auth (T-F3.1-03, REQ-3.2, NFR-10, NFR-12).
// Menggantikan AdapterSesiTiruan di jalur produksi. Sesi disimpan di cookie HttpOnly, Secure, SameSite Lax.
import type { AstroCookies } from 'astro';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AdapterSesi, Petugas } from './AutentikasiController';

export const NAMA_COOKIE_SESI = 'sigap-sesi';
export const NAMA_COOKIE_REFRESH = 'sigap-refresh';
export const NAMA_COOKIE_PETUGAS = 'sigap-petugas';

/**
 * PROJECT_RULES 5.3: Cookie HttpOnly, Secure (di production), SameSite Lax.
 */
export const OPSI_COOKIE = {
  path: '/',
  httpOnly: true,
  secure: Boolean(import.meta.env?.PROD || process.env.NODE_ENV === 'production'),
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 7, // 7 hari
};

export class AdapterSesiSupabase implements AdapterSesi {
  client: SupabaseClient;

  constructor(client?: SupabaseClient, opsi?: { url?: string; anonKey?: string }) {
    if (client) {
      this.client = client;
    } else {
      const url =
        opsi?.url ||
        process.env.SUPABASE_URL ||
        import.meta.env?.PUBLIC_SUPABASE_URL ||
        'http://127.0.0.1:54321';
      const anonKey =
        opsi?.anonKey ||
        process.env.SUPABASE_ANON_KEY ||
        import.meta.env?.PUBLIC_SUPABASE_ANON_KEY ||
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy';
      this.client = createClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }
  }

  /**
   * Masuk menggunakan Supabase Auth (email dan password).
   * Bila berhasil, memasang cookie token akses, refresh token, dan identitas petugas.
   * Bila gagal, mengembalikan null tanpa membocorkan alasan spesifik (REQ-3.4).
   */
  async masuk(email: string, password: string, cookies: AstroCookies): Promise<Petugas | null> {
    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.session || !data.user) {
        return null;
      }

      // Ambil nama petugas dari tabel public.petugas atau user_metadata
      let nama = '';
      try {
        const { data: petugasData } = await this.client
          .from('petugas')
          .select('nama')
          .eq('id', data.user.id)
          .maybeSingle();
        if (petugasData?.nama) {
          nama = petugasData.nama;
        }
      } catch {
        // Fallback bila query tabel petugas belum siap atau gagal
      }

      if (!nama) {
        nama = (data.user.user_metadata?.nama as string) || email.split('@')[0] || 'Petugas';
      }

      const petugas: Petugas = {
        nama,
        email: data.user.email ?? email,
      };

      cookies.set(NAMA_COOKIE_SESI, data.session.access_token, OPSI_COOKIE);
      if (data.session.refresh_token) {
        cookies.set(NAMA_COOKIE_REFRESH, data.session.refresh_token, OPSI_COOKIE);
      }
      cookies.set(NAMA_COOKIE_PETUGAS, JSON.stringify(petugas), OPSI_COOKIE);

      return petugas;
    } catch {
      return null;
    }
  }

  /**
   * Membaca sesi dari cookie dan memverifikasi token ke Supabase Auth.
   * Bila token kedaluwarsa, mencoba memperbarui sesi dengan refresh_token.
   */
  async baca(cookies: AstroCookies): Promise<Petugas | null> {
    const token = cookies.get(NAMA_COOKIE_SESI)?.value;
    if (!token) return null;

    try {
      const { data, error } = await this.client.auth.getUser(token);

      if (error || !data.user) {
        // Coba perbarui sesi lewat refresh token jika ada
        const refreshToken = cookies.get(NAMA_COOKIE_REFRESH)?.value;
        if (!refreshToken) return null;

        const { data: refreshData, error: refreshError } = await this.client.auth.refreshSession({
          refresh_token: refreshToken,
        });

        if (refreshError || !refreshData.session || !refreshData.user) {
          return null;
        }

        cookies.set(NAMA_COOKIE_SESI, refreshData.session.access_token, OPSI_COOKIE);
        if (refreshData.session.refresh_token) {
          cookies.set(NAMA_COOKIE_REFRESH, refreshData.session.refresh_token, OPSI_COOKIE);
        }

        const petugasCookie = cookies.get(NAMA_COOKIE_PETUGAS)?.value;
        if (petugasCookie) {
          try {
            return JSON.parse(petugasCookie) as Petugas;
          } catch {
            // Gunakan fallback
          }
        }

        return {
          nama: (refreshData.user.user_metadata?.nama as string) || refreshData.user.email?.split('@')[0] || 'Petugas',
          email: refreshData.user.email ?? '',
        };
      }

      // Token masih valid, kembalikan data petugas
      const petugasCookie = cookies.get(NAMA_COOKIE_PETUGAS)?.value;
      if (petugasCookie) {
        try {
          return JSON.parse(petugasCookie) as Petugas;
        } catch {
          // Abaikan
        }
      }

      return {
        nama: (data.user.user_metadata?.nama as string) || data.user.email?.split('@')[0] || 'Petugas',
        email: data.user.email ?? '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Mengembalikan penanda unik sesi (access token) untuk pencatatan idle timeout di AutentikasiController.
   */
  kunci(cookies: AstroCookies): string | null {
    return cookies.get(NAMA_COOKIE_SESI)?.value || null;
  }

  /**
   * Menghapus sesi: memanggil signOut di Supabase dan membersihkan seluruh cookie autentikasi.
   */
  async keluar(cookies: AstroCookies): Promise<void> {
    const token = cookies.get(NAMA_COOKIE_SESI)?.value;
    if (token) {
      try {
        await this.client.auth.signOut();
      } catch {
        // Abaikan bila server tidak terjangkau
      }
    }
    cookies.delete(NAMA_COOKIE_SESI, { path: '/' });
    cookies.delete(NAMA_COOKIE_REFRESH, { path: '/' });
    cookies.delete(NAMA_COOKIE_PETUGAS, { path: '/' });
  }
}
