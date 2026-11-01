// Control UC-02 Menyampaikan Pengaduan Produk: pencatatan dan penerbitan tiket pengaduan (T-F4.2-01, REQ-2.3, BR-1).
// Tidak memakai API khusus Deno agar bisa diuji dengan `node --test` tanpa basis data.
import { normalkanNomorTelepon } from '../entity/penelepon.ts';

const PANJANG_MAKS_NAMA_PRODUK = 200;
const PANJANG_MAKS_KRONOLOGI = 4000;
const PANJANG_MAKS_NAMA_PELAPOR = 100;
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kamus pesan PRD-rinci Lampiran A (UC-02 "Data kurang"). */
export const PESAN_MINTA_NOMOR_TELEPON = 'Mohon sebutkan nomor telepon Anda.';

export interface PenyimpananPengaduan {
  terbitkanTiketPengaduan(data: {
    percakapanId: string;
    namaProduk: string;
    kronologi: string;
    namaPelapor: string;
    nomorTelepon: string;
    ringkasan?: string;
  }): Promise<string>;
}

export class ErrorSigapPengaduan extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class PengaduanController {
  penyimpanan: PenyimpananPengaduan;

  constructor(penyimpanan: PenyimpananPengaduan) {
    this.penyimpanan = penyimpanan;
  }

  /**
   * REQ-2.3, BR-1: Mencatat pengaduan lengkap dan menerbitkan tiket ADU-YYYYMMDD-NNNN.
   * Tiket hanya diterbitkan bila seluruh data: nama produk, kronologi, nama pelapor, dan nomor telepon lengkap.
   */
  async terbitkanTiketPengaduan(input: {
    percakapanId?: unknown;
    namaProduk?: unknown;
    kronologi?: unknown;
    namaPelapor?: unknown;
    nomorTelepon?: unknown;
    ringkasan?: unknown;
  }): Promise<{ nomorTiket: string }> {
    if (typeof input.percakapanId !== 'string' || !POLA_UUID.test(input.percakapanId)) {
      throw new ErrorSigapPengaduan(422, 'Percakapan tidak valid.');
    }
    const percakapanId = input.percakapanId;

    const namaProduk = typeof input.namaProduk === 'string' ? input.namaProduk.trim() : '';
    if (!namaProduk || namaProduk.length > PANJANG_MAKS_NAMA_PRODUK) {
      throw new ErrorSigapPengaduan(422, 'Nama produk wajib diisi.');
    }

    const kronologi = typeof input.kronologi === 'string' ? input.kronologi.trim() : '';
    if (!kronologi || kronologi.length > PANJANG_MAKS_KRONOLOGI) {
      throw new ErrorSigapPengaduan(422, 'Kronologi kejadian wajib diisi.');
    }

    const namaPelapor = typeof input.namaPelapor === 'string' ? input.namaPelapor.trim() : '';
    if (!namaPelapor || namaPelapor.length > PANJANG_MAKS_NAMA_PELAPOR) {
      throw new ErrorSigapPengaduan(422, 'Nama pelapor wajib diisi.');
    }

    const nomorTelepon = typeof input.nomorTelepon === 'string' ? normalkanNomorTelepon(input.nomorTelepon) : null;
    if (!nomorTelepon) {
      throw new ErrorSigapPengaduan(422, PESAN_MINTA_NOMOR_TELEPON);
    }

    const ringkasan = typeof input.ringkasan === 'string' && input.ringkasan.trim() ? input.ringkasan.trim() : undefined;

    const nomorTiket = await this.penyimpanan.terbitkanTiketPengaduan({
      percakapanId,
      namaProduk,
      kronologi,
      namaPelapor,
      nomorTelepon,
      ringkasan,
    });

    return { nomorTiket };
  }
}
