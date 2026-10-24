// Control UC-03 Melakukan Login Dashboard (REQ-3.1 sampai REQ-3.4) dan timeout idle sesi (NFR-12).
// Penguncian akun (REQ-3.5) menyusul di F3.2.
import type { AstroCookies } from 'astro';

export type Petugas = { nama: string; email: string };

/** Penyedia autentikasi (PROJECT_RULES 4.3): sekarang tiruan, Supabase Auth di T-F3.1-03. */
export interface AdapterSesi {
  /** Memeriksa kredensial lalu memasang cookie sesi. Null bila email atau password salah. */
  masuk(email: string, password: string, cookies: AstroCookies): Promise<Petugas | null>;
  /** Pemilik cookie sesi, atau null bila tidak ada sesi yang sah. */
  baca(cookies: AstroCookies): Promise<Petugas | null>;
  keluar(cookies: AstroCookies): Promise<void>;
  /** Penanda unik sesi pada cookie ini, untuk mencatat aktivitas terakhir. Null bila tidak ada sesi. */
  kunci(cookies: AstroCookies): string | null;
}

/** NFR-12: sesi berakhir setelah 30 menit tanpa aktivitas. */
export const BATAS_IDLE_BAWAAN_MS = 30 * 60 * 1000;

/** Kamus pesan PRD-rinci Lampiran A, UC-03. */
export const PESAN_LOGIN = {
  berhasil: 'Login berhasil!',
  kosong: 'Login gagal. Semua field harus diisi!',
  salah: 'Login gagal. Email atau password Anda salah.',
} as const;

// PROJECT_RULES 5.6: panjang isian dibatasi sebelum diteruskan ke penyedia autentikasi.
const PANJANG_MAKS_ISIAN = 256;

export type HasilLogin =
  | { kode: 200; pesan: string; petugas: Petugas }
  | { kode: 401 | 422; pesan: string; petugas: null };

export class AutentikasiController {
  adapter: AdapterSesi;
  batasIdleMs: number;
  now: () => number;
  // Aktivitas terakhir per sesi disimpan di server agar tidak bisa diperpanjang dari browser.
  aktivitas = new Map<string, number>();

  constructor(adapter: AdapterSesi, opsi: { batasIdleMs?: number; now?: () => number } = {}) {
    this.adapter = adapter;
    this.batasIdleMs = opsi.batasIdleMs ?? BATAS_IDLE_BAWAAN_MS;
    this.now = opsi.now ?? Date.now;
  }

  /**
   * REQ-3.1: isian divalidasi dulu (REQ-3.3), baru kredensial diperiksa (REQ-3.4).
   * Pesan gagal tidak membedakan email tidak terdaftar dan password salah.
   */
  async masuk(input: { email?: unknown; password?: unknown }, cookies: AstroCookies): Promise<HasilLogin> {
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!email || !password) return { kode: 422, pesan: PESAN_LOGIN.kosong, petugas: null };
    if (email.length > PANJANG_MAKS_ISIAN || password.length > PANJANG_MAKS_ISIAN) {
      return { kode: 401, pesan: PESAN_LOGIN.salah, petugas: null };
    }
    const petugas = await this.adapter.masuk(email, password, cookies);
    if (!petugas) return { kode: 401, pesan: PESAN_LOGIN.salah, petugas: null };
    return { kode: 200, pesan: PESAN_LOGIN.berhasil, petugas };
  }

  /** Pemilik sesi bila sesi sah dan belum idle melewati batas. Setiap pemeriksaan yang lolos dihitung sebagai aktivitas. */
  async sesiAktif(cookies: AstroCookies): Promise<Petugas | null> {
    const petugas = await this.adapter.baca(cookies);
    const kunci = this.adapter.kunci(cookies);
    if (!petugas || !kunci) return null;
    const sekarang = this.now();
    const terakhir = this.aktivitas.get(kunci);
    if (terakhir !== undefined && sekarang - terakhir > this.batasIdleMs) {
      await this.keluar(cookies);
      return null;
    }
    this.aktivitas.set(kunci, sekarang);
    if (this.aktivitas.size > 1000) {
      for (const [k, t] of this.aktivitas) if (sekarang - t > this.batasIdleMs) this.aktivitas.delete(k);
    }
    return petugas;
  }

  /** Logout: sesi dihapus di penyedia autentikasi beserta cookie dan catatan aktivitasnya. */
  async keluar(cookies: AstroCookies): Promise<void> {
    const kunci = this.adapter.kunci(cookies);
    if (kunci) this.aktivitas.delete(kunci);
    await this.adapter.keluar(cookies);
  }
}
