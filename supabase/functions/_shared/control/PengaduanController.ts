// Control UC-02 Menyampaikan Pengaduan Produk: pencatatan dan penerbitan tiket pengaduan (T-F4.2-01, T-F4.3-02, REQ-2.3, REQ-2.5, BR-1).
// Tidak memakai API khusus Deno agar bisa diuji dengan `node --test` tanpa basis data.
import { normalkanNomorTelepon } from '../entity/penelepon.ts';
import { ErrorSigap, type LogTool } from './InformasiProdukController.ts';

export type { LogTool };

const PANJANG_MAKS_NAMA_PRODUK = 200;
const PANJANG_MAKS_KRONOLOGI = 4000;
const PANJANG_MAKS_NAMA_PELAPOR = 100;
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kamus pesan PRD-rinci Lampiran A (UC-02 "Data kurang"). */
export const PESAN_MINTA_NOMOR_TELEPON = 'Mohon sebutkan nomor telepon Anda.';

/** Kamus pesan PRD-rinci Lampiran A (UC-02 "Panggilan putus, data kurang"). */
export const PESAN_PENGADUAN_TIDAK_LENGKAP = 'Panggilan berakhir. Pengaduan belum lengkap sehingga nomor tiket tidak diterbitkan.';

export interface PenyimpananPengaduan {
  catatLogTool(log: LogTool): Promise<void>;

  /** Nomor tiket ADU yang sudah terbit untuk percakapan ini, atau null. Dipakai agar retry tidak membuat tiket ganda. */
  cariTiketPengaduan(percakapanId: string): Promise<string | null>;

  terbitkanTiketPengaduan(data: {
    percakapanId: string;
    namaProduk: string;
    kronologi: string;
    namaPelapor: string;
    nomorTelepon: string;
    ringkasan?: string;
  }): Promise<string>;

  simpanPengaduanTidakLengkap(data: {
    percakapanId: string;
    namaProduk?: string;
    kronologi?: string;
    namaPelapor?: string;
    nomorTelepon?: string;
  }): Promise<string>;
}

/** Error terkendali UC-02. Turunan ErrorSigap supaya boundary bersama (`layani`) mengembalikan kode dan pesannya. */
export class ErrorSigapPengaduan extends ErrorSigap {}

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

    const mulai = Date.now();
    let berhasil = false;
    // Percakapan yang tidak ada tidak bisa dirujuk foreign key log_tool, jadi log gagalnya dicatat tanpa percakapan.
    let percakapanLog: string | null = percakapanId;
    try {
      // Retry untuk percakapan yang sudah bertiket mengembalikan nomor yang sama, bukan tiket baru (satu percakapan satu tiket).
      const sudahAda = await this.penyimpanan.cariTiketPengaduan(percakapanId);
      if (sudahAda) {
        berhasil = true;
        return { nomorTiket: sudahAda };
      }
      const nomorTiket = await this.penyimpanan.terbitkanTiketPengaduan({
        percakapanId,
        namaProduk,
        kronologi,
        namaPelapor,
        nomorTelepon,
        ringkasan,
      });
      berhasil = true;
      return { nomorTiket };
    } catch (e) {
      if (e instanceof ErrorSigap && e.status === 404) percakapanLog = null;
      throw e;
    } finally {
      await this.catat({ percakapanId: percakapanLog, namaTool: 'terbitkan_tiket_pengaduan', durasiMs: Date.now() - mulai, berhasil });
    }
  }

  /**
   * REQ-2.5: Menyimpan percakapan pengaduan yang berakhir sebelum data lengkap tanpa menerbitkan nomor tiket.
   */
  async simpanPengaduanTidakLengkap(input: {
    percakapanId?: unknown;
    namaProduk?: unknown;
    kronologi?: unknown;
    namaPelapor?: unknown;
    nomorTelepon?: unknown;
  }): Promise<{ id: string; status: 'pengaduan_tidak_lengkap' }> {
    if (typeof input.percakapanId !== 'string' || !POLA_UUID.test(input.percakapanId)) {
      throw new ErrorSigapPengaduan(422, 'Percakapan tidak valid.');
    }
    const percakapanId = input.percakapanId;

    const namaProduk = typeof input.namaProduk === 'string' && input.namaProduk.trim() ? input.namaProduk.trim() : undefined;
    const kronologi = typeof input.kronologi === 'string' && input.kronologi.trim() ? input.kronologi.trim() : undefined;
    const namaPelapor = typeof input.namaPelapor === 'string' && input.namaPelapor.trim() ? input.namaPelapor.trim() : undefined;
    const nomorTelepon = typeof input.nomorTelepon === 'string' ? normalkanNomorTelepon(input.nomorTelepon) ?? undefined : undefined;

    const mulai = Date.now();
    let berhasil = false;
    try {
      const id = await this.penyimpanan.simpanPengaduanTidakLengkap({
        percakapanId,
        namaProduk,
        kronologi,
        namaPelapor,
        nomorTelepon,
      });
      berhasil = true;
      return { id, status: 'pengaduan_tidak_lengkap' };
    } finally {
      await this.catat({ percakapanId, namaTool: 'simpan_pengaduan_tidak_lengkap', durasiMs: Date.now() - mulai, berhasil });
    }
  }

  // Gagal mencatat log tidak boleh menggagalkan penerbitan tiket. Log berisi nama tool dan hasil saja, tanpa data pelapor.
  async catat(log: LogTool) {
    try {
      await this.penyimpanan.catatLogTool(log);
      return;
    } catch {
      if (log.percakapanId === null) return console.error('log_tool gagal dicatat', log.namaTool);
    }
    try {
      await this.penyimpanan.catatLogTool({ ...log, percakapanId: null });
    } catch {
      console.error('log_tool gagal dicatat', log.namaTool);
    }
  }
}
