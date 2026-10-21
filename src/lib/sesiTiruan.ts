// ponytail: sesi tiruan di memori server sampai T-F3.1-03 memasang Supabase Auth. Satu akun demo,
// sesi hilang saat server dimulai ulang dan tidak dibagi antarproses.
import type { AstroCookies } from 'astro';
import type { AdapterSesi, Petugas } from './AutentikasiController';

const COOKIE_SESI = 'sigap-sesi';
const DEMO = { email: 'dewi.lestari@pom.go.id', password: 'sigap2026', nama: 'Dewi Lestari' };

// PROJECT_RULES 5.3. Secure hanya di build produksi karena server pengembangan memakai http.
const OPSI_COOKIE = { path: '/', httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax' } as const;

export class AdapterSesiTiruan implements AdapterSesi {
  sesi = new Map<string, Petugas>();

  async masuk(email: string, password: string, cookies: AstroCookies): Promise<Petugas | null> {
    if (email.toLowerCase() !== DEMO.email || password !== DEMO.password) return null;
    const token = crypto.randomUUID();
    const petugas = { nama: DEMO.nama, email: DEMO.email };
    this.sesi.set(token, petugas);
    cookies.set(COOKIE_SESI, token, OPSI_COOKIE);
    return petugas;
  }

  async baca(cookies: AstroCookies): Promise<Petugas | null> {
    const token = cookies.get(COOKIE_SESI)?.value;
    return (token && this.sesi.get(token)) || null;
  }

  async keluar(cookies: AstroCookies): Promise<void> {
    const token = cookies.get(COOKIE_SESI)?.value;
    if (token) this.sesi.delete(token);
    cookies.delete(COOKIE_SESI, { path: '/' });
  }
}
