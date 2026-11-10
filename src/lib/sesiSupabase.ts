// Adapter produksi AdapterSesi: sesi petugas dari Supabase Auth (UC-03, NFR-10 sampai NFR-12).
// Login lewat Edge Function `login` (penghitung gagal dan penguncian ada di sana) dengan kunci login server
// (header x-sigap-kunci), yang tidak pernah dikirim ke browser. Token akses dan refresh disimpan di cookie HttpOnly.
// Setiap pemeriksaan sesi divalidasi ke Supabase Auth dengan kunci anon, bukan service_role, lalu peran petugas dicek
// lewat RPC is_petugas() seperti yang dilakukan RLS di database.
import type { AstroCookies } from 'astro';
import { PESAN_LOGIN, type AdapterSesi, type GagalMasuk, type Petugas } from './AutentikasiController.ts';

export const COOKIE_AKSES = 'sigap-at';
export const COOKIE_REFRESH = 'sigap-rt';
export const PESAN_SISTEM = 'Terjadi kesalahan pada sistem.';

const BATAS_WAKTU_MS = 5000;
// Penolakan UC-03 dari Edge Function login yang boleh diteruskan ke petugas; pesan lain menjadi PESAN_SISTEM.
const PESAN_PENOLAKAN: readonly string[] = [PESAN_LOGIN.kosong, PESAN_LOGIN.salah, PESAN_LOGIN.dikunci];
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Token = { akses: string; refresh: string };

export class SesiSupabase implements AdapterSesi {
  url: string;
  kunciAnon: string;
  kunciLogin: string;
  secure: boolean;
  fetch: typeof fetch;

  /**
   * secure: true di build produksi (PROJECT_RULES 5.3); server pengembangan memakai http sehingga cookie Secure tidak terkirim.
   * kunciLogin: SIGAP_KUNCI_LOGIN untuk Edge Function login. Kosong berarti header tidak dikirim, yang hanya diterima
   * selama secret itu belum diisi di Supabase.
   */
  constructor(opsi: { url: string; kunciAnon: string; kunciLogin?: string; secure: boolean; fetch?: typeof fetch }) {
    this.url = opsi.url.replace(/\/+$/, '');
    this.kunciAnon = opsi.kunciAnon;
    this.kunciLogin = opsi.kunciLogin ?? '';
    this.secure = opsi.secure;
    this.fetch = opsi.fetch ?? globalThis.fetch;
  }

  get opsiCookie() {
    return { path: '/', httpOnly: true, secure: this.secure, sameSite: 'lax' } as const;
  }

  /** Memanggil Supabase dengan kunci anon. Token petugas, bila ada, dikirim sebagai Bearer agar RLS berlaku. */
  async panggil(
    path: string,
    opsi: { token?: string; method?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<Response | null> {
    try {
      return await this.fetch(`${this.url}${path}`, {
        method: opsi.method ?? (opsi.body === undefined ? 'GET' : 'POST'),
        headers: {
          apikey: this.kunciAnon,
          Authorization: `Bearer ${opsi.token ?? this.kunciAnon}`,
          ...(opsi.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...opsi.headers,
        },
        body: opsi.body === undefined ? undefined : JSON.stringify(opsi.body),
        signal: AbortSignal.timeout(BATAS_WAKTU_MS),
      });
    } catch {
      return null;
    }
  }

  get terkonfigurasi() {
    return Boolean(this.url && this.kunciAnon);
  }

  /** Validasi token ke Supabase Auth, lalu pastikan pemiliknya petugas. Null bila token tidak sah atau bukan petugas. */
  async periksa(token: string): Promise<Petugas | null> {
    const resUser = await this.panggil('/auth/v1/user', { token });
    if (!resUser?.ok) return null;
    const user = (await resUser.json().catch(() => null)) as { id?: unknown; email?: unknown } | null;
    if (typeof user?.id !== 'string' || !POLA_UUID.test(user.id) || typeof user.email !== 'string') return null;

    const [resPeran, resNama] = await Promise.all([
      this.panggil('/rest/v1/rpc/is_petugas', { token, body: {} }),
      this.panggil(`/rest/v1/petugas?select=nama&id=eq.${user.id}`, { token }),
    ]);
    if (!resPeran?.ok || (await resPeran.json().catch(() => null)) !== true) return null;
    const baris = resNama?.ok ? ((await resNama.json().catch(() => null)) as { nama?: unknown }[] | null) : null;
    const nama = typeof baris?.[0]?.nama === 'string' ? baris[0].nama : '';
    return { nama, email: user.email };
  }

  pasangCookie(cookies: AstroCookies, token: Token) {
    cookies.set(COOKIE_AKSES, token.akses, this.opsiCookie);
    cookies.set(COOKIE_REFRESH, token.refresh, this.opsiCookie);
  }

  hapusCookie(cookies: AstroCookies) {
    cookies.delete(COOKIE_AKSES, { path: '/' });
    cookies.delete(COOKIE_REFRESH, { path: '/' });
  }

  async masuk(email: string, password: string, cookies: AstroCookies): Promise<Petugas | GagalMasuk | null> {
    const sistem: GagalMasuk = { gagal: PESAN_SISTEM, kode: 503 };
    if (!this.terkonfigurasi) return sistem;
    const res = await this.panggil('/functions/v1/login', {
      body: { email, password },
      headers: this.kunciLogin ? { 'x-sigap-kunci': this.kunciLogin } : {},
    });
    if (!res) return sistem;
    type Sesi = { access_token?: unknown; refresh_token?: unknown } | null;
    // Format standar { status, message, data }, dan format lama { sukses, pesan, sesi } selama fungsi login di Supabase
    // belum dideploy ulang, supaya dashboard ini bisa dideploy lebih dulu (urutan deploy di supabase/README.md).
    const hasil = (await res.json().catch(() => null)) as {
      status?: unknown;
      message?: unknown;
      data?: { sesi?: Sesi } | null;
      sukses?: unknown;
      pesan?: unknown;
      sesi?: Sesi;
    } | null;

    if (res.ok && (hasil?.status === 'success' || hasil?.sukses === true)) {
      const { access_token: akses, refresh_token: refresh } = hasil.data?.sesi ?? hasil.sesi ?? {};
      if (typeof akses !== 'string' || typeof refresh !== 'string') return sistem;
      // Token dari Edge Function tidak dipercaya begitu saja: divalidasi dan dicek perannya sebelum cookie dipasang.
      const petugas = await this.periksa(akses);
      if (!petugas) {
        // Sesi yang sudah dibuat Edge Function dicabut agar refresh token-nya tidak menggantung.
        await this.panggil('/auth/v1/logout?scope=local', { token: akses, method: 'POST' });
        return null;
      }
      this.pasangCookie(cookies, { akses, refresh });
      return petugas;
    }
    // Penolakan yang disengaja (kredensial salah, akun terkunci) membawa pesan kamus UC-03. Kegagalan lain, termasuk
    // kunci login yang ditolak dan galat teknis Supabase Auth (503), tidak diteruskan.
    const pesan = hasil?.message ?? hasil?.pesan;
    if (res.status === 401 && typeof pesan === 'string' && PESAN_PENOLAKAN.includes(pesan)) return { gagal: pesan, kode: 401 };
    return sistem;
  }

  async baca(cookies: AstroCookies): Promise<Petugas | null> {
    if (!this.terkonfigurasi) return null;
    const akses = cookies.get(COOKIE_AKSES)?.value;
    const refresh = cookies.get(COOKIE_REFRESH)?.value;
    if (!akses) return null;
    const petugas = await this.periksa(akses);
    if (petugas) return petugas;
    return refresh ? this.perbarui(refresh, cookies) : null;
  }

  /** Token akses kedaluwarsa: tukar refresh token, lalu periksa ulang sebelum cookie baru dipasang. */
  async perbarui(refresh: string, cookies: AstroCookies): Promise<Petugas | null> {
    const res = await this.panggil('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: refresh } });
    if (!res) return null;
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) this.hapusCookie(cookies);
      return null;
    }
    const baru = (await res.json().catch(() => null)) as { access_token?: unknown; refresh_token?: unknown } | null;
    if (typeof baru?.access_token !== 'string' || typeof baru.refresh_token !== 'string') return null;
    const petugas = await this.periksa(baru.access_token);
    if (!petugas) return null;
    this.pasangCookie(cookies, { akses: baru.access_token, refresh: baru.refresh_token });
    return petugas;
  }

  /**
   * Penanda sesi untuk pencatatan aktivitas idle: klaim session_id pada token, yang tetap sama saat token diperbarui.
   * Hanya dipakai sebagai kunci. Keabsahan token diperiksa di baca().
   */
  kunci(cookies: AstroCookies): string | null {
    const akses = cookies.get(COOKIE_AKSES)?.value;
    const payload = akses?.split('.')[1];
    if (!payload) return null;
    try {
      const klaim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { session_id?: unknown };
      return typeof klaim.session_id === 'string' && klaim.session_id ? klaim.session_id : null;
    } catch {
      return null;
    }
  }

  tokenAkses(cookies: AstroCookies): string | null {
    return cookies.get(COOKIE_AKSES)?.value || null;
  }

  async keluar(cookies: AstroCookies): Promise<void> {
    const akses = cookies.get(COOKIE_AKSES)?.value;
    // Pencabutan di server dicoba sebisanya; cookie tetap dihapus walau Supabase tidak terjangkau.
    if (akses && this.terkonfigurasi) await this.panggil('/auth/v1/logout?scope=local', { token: akses, method: 'POST' });
    this.hapusCookie(cookies);
  }
}
