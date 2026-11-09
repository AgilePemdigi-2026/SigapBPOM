// Control UC-03 Melakukan Login Dashboard: penguncian akun setelah tiga kali gagal (T-F3.2-02, REQ-3.1, REQ-3.5, NFR-11).
// Tidak memakai API khusus Deno agar bisa diuji dengan `node --test` tanpa basis data.
import { ErrorSigap } from './InformasiProdukController.ts';

/** Kamus pesan PRD-rinci Lampiran A (UC-03). */
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
  /** Mengembalikan slot yang gagal karena galat teknis, beserta kuncinya (RPC kembalikan_percobaan_login). */
  kembalikanPercobaan(id: string): Promise<void>;
}

export interface Autentikator {
  /**
   * galat.status 400 berarti kredensial ditolak Supabase Auth. Status lain (429 rate limit, 5xx, 0 untuk jaringan)
   * atau tanpa status adalah galat teknis.
   */
  masukDenganPassword(email: string, kataSandi: string): Promise<{ sesi: unknown; galat: { status?: number } | null }>;
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
    // REQ-3.4: Supabase Auth menyimpan email dengan huruf kecil, jadi email dinormalkan sebelum dicari dan diperiksa.
    const alamat = email.trim().toLowerCase();
    if (!alamat || !kataSandi) {
      return { sukses: false, pesan: PESAN_FIELD_KOSONG };
    }

    const user = await this.penyimpanan.dapatkanUserByEmail(alamat);
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

    const { sesi, galat } = await this.autentikator
      .masukDenganPassword(alamat, kataSandi)
      .catch(() => ({ sesi: null, galat: { status: 0 } }));

    // REQ-3.5, NFR-11: galat teknis bukan percobaan gagal dan tidak boleh mengunci akun, jadi slotnya dikembalikan.
    if (galat && galat.status !== 400) {
      console.error('galat Supabase Auth', galat.status ?? 'unknown');
      await this.penyimpanan.kembalikanPercobaan(petugasData.id);
      throw new ErrorSigap(503, 'Terjadi kesalahan pada sistem.');
    }

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
