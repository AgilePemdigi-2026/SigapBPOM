// Control UC-22 Masuk Dashboard: penguncian akun setelah tiga kali gagal (T-F3.2-02, REQ-3.1, REQ-3.5, NFR-11).
// Tidak memakai API khusus Deno agar bisa diuji dengan `node --test` tanpa basis data.

/** Kamus pesan PRD-rinci Lampiran A (UC-22). */
export const PESAN_FIELD_KOSONG = 'Login gagal. Semua field harus diisi!';
export const PESAN_KREDENSIAL_SALAH = 'Login gagal. Email atau password Anda salah.';
export const PESAN_AKSES_DIKUNCI = 'Akses dikunci sementara. Hubungi administrator.';
export const PESAN_LOGIN_BERHASIL = 'Login berhasil!';

export interface DataPetugas {
  id: string;
  nama: string;
  terkunci_sampai?: string | null;
}

export interface PenyimpananPetugas {
  dapatkanUserByEmail(email: string): Promise<{ petugasData: DataPetugas | null } | null>;
  /** Penambahan penghitung dan penetapan kunci dilakukan atomik di basis data (RPC catat_gagal_login). */
  catatGagalLogin(id: string): Promise<{ gagalLogin: number; terkunciSampai: string | null } | null>;
  /** Mengembalikan false bila akun sedang terkunci (RPC reset_gagal_login). */
  resetGagalLogin(id: string): Promise<boolean>;
}

export interface Autentikator {
  masukDenganPassword(email: string, kataSandi: string): Promise<{ sesi: unknown; galat: unknown }>;
}

export type HasilMasuk =
  | { sukses: true; pesan: string; sesi: unknown; petugas: { id: string; nama: string } }
  | { sukses: false; pesan: string };

function sedangTerkunci(terkunciSampai: string | null | undefined, sekarang: Date): boolean {
  return !!terkunciSampai && sekarang < new Date(terkunciSampai);
}

export class AutentikasiEdgeController {
  penyimpanan: PenyimpananPetugas;
  autentikator: Autentikator;
  jam: () => Date;

  constructor(penyimpanan: PenyimpananPetugas, autentikator: Autentikator, jam: () => Date = () => new Date()) {
    this.penyimpanan = penyimpanan;
    this.autentikator = autentikator;
    this.jam = jam;
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

    // Kunci diperiksa sebelum password, sehingga password benar pun ditolak selama akun terkunci.
    if (sedangTerkunci(petugasData.terkunci_sampai, this.jam())) {
      return { sukses: false, pesan: PESAN_AKSES_DIKUNCI };
    }

    const { sesi, galat } = await this.autentikator.masukDenganPassword(email, kataSandi);

    if (galat) {
      const hasil = await this.penyimpanan.catatGagalLogin(petugasData.id);
      // Keputusan kunci diambil dari baris yang dikembalikan basis data, bukan dihitung di sini.
      if (hasil && sedangTerkunci(hasil.terkunciSampai, this.jam())) {
        return { sukses: false, pesan: PESAN_AKSES_DIKUNCI };
      }
      return { sukses: false, pesan: PESAN_KREDENSIAL_SALAH };
    }

    // Bila akun terkunci oleh percobaan paralel, reset ditolak dan sesi tidak diberikan.
    const berhasilReset = await this.penyimpanan.resetGagalLogin(petugasData.id);
    if (!berhasilReset) {
      return { sukses: false, pesan: PESAN_AKSES_DIKUNCI };
    }

    return {
      sukses: true,
      pesan: PESAN_LOGIN_BERHASIL,
      sesi,
      petugas: { id: petugasData.id, nama: petugasData.nama },
    };
  }
}
