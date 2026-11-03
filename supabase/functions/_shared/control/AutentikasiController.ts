// Control UC-22 Masuk Dashboard: penguncian akun setelah tiga kali gagal (T-F3.2-02, REQ-3.1, REQ-3.5, NFR-11).
// Tidak memakai API khusus Deno agar bisa diuji dengan `node --test` tanpa basis data.

/** Kamus pesan PRD-rinci Lampiran A (UC-22). */
export const PESAN_FIELD_KOSONG = 'Login gagal. Semua field harus diisi!';
export const PESAN_KREDENSIAL_SALAH = 'Login gagal. Email atau password Anda salah.';
export const PESAN_AKSES_DIKUNCI = 'Akses dikunci sementara. Hubungi administrator.';
export const PESAN_LOGIN_BERHASIL = 'Login berhasil!';

/** REQ-3.5, NFR-11: akun dikunci pada percobaan gagal ketiga. Sama dengan ambang di RPC reservasi_percobaan_login. */
export const BATAS_GAGAL_LOGIN = 3;

export interface DataPetugas {
  id: string;
  nama: string;
}

export interface PenyimpananPetugas {
  dapatkanUserByEmail(email: string): Promise<{ petugasData: DataPetugas | null } | null>;
  /**
   * Memesan satu slot percobaan secara atomik (RPC reservasi_percobaan_login). Mengembalikan nomor
   * percobaan 1 sampai BATAS_GAGAL_LOGIN, atau null bila akun terkunci. Slot terakhir memasang kunci.
   */
  reservasiPercobaan(id: string): Promise<number | null>;
  /** Mengosongkan penghitung dan kunci setelah password benar (RPC reset_gagal_login). */
  resetGagalLogin(id: string): Promise<void>;
}

export interface Autentikator {
  masukDenganPassword(email: string, kataSandi: string): Promise<{ sesi: unknown; galat: unknown }>;
}

export type HasilMasuk =
  | { sukses: true; pesan: string; sesi: unknown; petugas: { id: string; nama: string } }
  | { sukses: false; pesan: string };

export class AutentikasiEdgeController {
  penyimpanan: PenyimpananPetugas;
  autentikator: Autentikator;

  constructor(penyimpanan: PenyimpananPetugas, autentikator: Autentikator) {
    this.penyimpanan = penyimpanan;
    this.autentikator = autentikator;
  }

  async masuk(email: string, kataSandi: string): Promise<HasilMasuk> {
    if (!email || !kataSandi) {
      return { sukses: false, pesan: PESAN_FIELD_KOSONG };
    }

    const user = await this.penyimpanan.dapatkanUserByEmail(email);
    if (!user || !user.petugasData) {
      return { sukses: false, pesan: PESAN_KREDENSIAL_SALAH };
    }
    const { petugasData } = user;

    // Slot dipesan sebelum password diperiksa, sehingga request paralel pun paling banyak memeriksa
    // BATAS_GAGAL_LOGIN password, dan password benar ditolak selama akun terkunci.
    const nomorPercobaan = await this.penyimpanan.reservasiPercobaan(petugasData.id);
    if (nomorPercobaan === null) {
      return { sukses: false, pesan: PESAN_AKSES_DIKUNCI };
    }

    const { sesi, galat } = await this.autentikator.masukDenganPassword(email, kataSandi);

    if (galat) {
      // Slot sudah terhitung gagal; slot terakhir sudah memasang kunci di basis data.
      const pesan = nomorPercobaan >= BATAS_GAGAL_LOGIN ? PESAN_AKSES_DIKUNCI : PESAN_KREDENSIAL_SALAH;
      return { sukses: false, pesan };
    }

    await this.penyimpanan.resetGagalLogin(petugasData.id);

    return {
      sukses: true,
      pesan: PESAN_LOGIN_BERHASIL,
      sesi,
      petugas: { id: petugasData.id, nama: petugasData.nama },
    };
  }
}
