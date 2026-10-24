// Control UC-01 Menanyakan Informasi Produk: cek registrasi (F1.2) dan tiket eskalasi (F1.4).
// Tidak memakai API khusus Deno agar bisa diuji dengan `node --test` tanpa basis data.
import type { AdapterCekBpom } from '../adapter/cekbpom.ts';
import type { Produk } from '../entity/produk.ts';
import { normalkanNomorTelepon } from '../entity/penelepon.ts';

/** NFR-2: pencarian data registrasi paling lambat 5 detik. */
export const BATAS_WAKTU_CEK_REGISTRASI_MS = 5000;
const PANJANG_MAKS_NAMA_PRODUK = 200;
const PANJANG_MAKS_PERTANYAAN = 2000;
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kamus pesan PRD-rinci Lampiran A (UC-02 "Data kurang"), dipakai agen untuk meminta ulang nomor. */
export const PESAN_MINTA_NOMOR_TELEPON = 'Mohon sebutkan nomor telepon Anda.';

export type LogTool = { percakapanId: string | null; namaTool: string; durasiMs: number; berhasil: boolean };

export interface PenyimpananLayanan {
  catatLogTool(log: LogTool): Promise<void>;
  /** Mengembalikan nomor tiket ESK-YYYYMMDD-NNNN; melempar ErrorSigap 404 bila percakapan tidak ada. */
  terbitkanTiketEskalasi(data: { percakapanId: string; nomorTelepon: string; ringkasan: string }): Promise<string>;
}

/** Error terkendali: `status` kode HTTP, `message` aman ditampilkan ke klien. */
export class ErrorSigap extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class InformasiProdukController {
  adapter: AdapterCekBpom;
  penyimpanan: PenyimpananLayanan;
  batasWaktuMs: number;

  constructor(adapter: AdapterCekBpom, penyimpanan: PenyimpananLayanan, batasWaktuMs = BATAS_WAKTU_CEK_REGISTRASI_MS) {
    this.adapter = adapter;
    this.penyimpanan = penyimpanan;
    this.batasWaktuMs = batasWaktuMs;
  }

  /**
   * REQ-1.3, NFR-7: hasil hanya dari adapter cekbpom. Hasil kosong berarti tidak ditemukan;
   * timeout atau gangguan adapter menjadi error, tidak pernah menjadi status karangan.
   * Seluruh hasil dikembalikan agar agen bisa menyebut jumlahnya; pembatasan tiga kandidat (BR-7) di agen.
   */
  async cekRegistrasi(input: { namaProduk?: unknown; percakapanId?: unknown }): Promise<{ hasil: Produk[] }> {
    const namaProduk = typeof input.namaProduk === 'string' ? input.namaProduk.trim() : '';
    if (!namaProduk || namaProduk.length > PANJANG_MAKS_NAMA_PRODUK) throw new ErrorSigap(422, 'Nama produk wajib diisi.');
    const percakapanId = this.percakapanIdOpsional(input.percakapanId);

    const mulai = Date.now();
    let berhasil = false;
    try {
      const hasil = await this.denganBatasWaktu((signal) => this.adapter.cari(namaProduk, signal));
      berhasil = true;
      return { hasil };
    } finally {
      await this.catat({ percakapanId, namaTool: 'cek_registrasi_bpom', durasiMs: Date.now() - mulai, berhasil });
    }
  }

  /** REQ-1.7, NFR-6: pertanyaan yang butuh petugas diterbitkan tiket ESK berstatus belum ditelaah. */
  async terbitkanTiketEskalasi(input: { percakapanId?: unknown; nomorTelepon?: unknown; pertanyaan?: unknown }): Promise<{ nomorTiket: string }> {
    const percakapanId = this.percakapanIdOpsional(input.percakapanId);
    if (!percakapanId) throw new ErrorSigap(422, 'Percakapan tidak valid.');
    const nomorTelepon = typeof input.nomorTelepon === 'string' ? normalkanNomorTelepon(input.nomorTelepon) : null;
    if (!nomorTelepon) throw new ErrorSigap(422, PESAN_MINTA_NOMOR_TELEPON);
    const pertanyaan = typeof input.pertanyaan === 'string' ? input.pertanyaan.trim() : '';
    if (!pertanyaan || pertanyaan.length > PANJANG_MAKS_PERTANYAAN) throw new ErrorSigap(422, 'Pertanyaan wajib diisi.');

    const mulai = Date.now();
    let berhasil = false;
    // Percakapan yang tidak ada tidak bisa dirujuk foreign key log_tool, jadi log gagalnya dicatat tanpa percakapan (#32).
    let percakapanLog: string | null = percakapanId;
    try {
      const nomorTiket = await this.penyimpanan.terbitkanTiketEskalasi({ percakapanId, nomorTelepon, ringkasan: pertanyaan });
      berhasil = true;
      return { nomorTiket };
    } catch (e) {
      if (e instanceof ErrorSigap && e.status === 404) percakapanLog = null;
      throw e;
    } finally {
      await this.catat({ percakapanId: percakapanLog, namaTool: 'terbitkan_tiket_eskalasi', durasiMs: Date.now() - mulai, berhasil });
    }
  }

  percakapanIdOpsional(nilai: unknown): string | null {
    if (nilai === undefined || nilai === null) return null;
    if (typeof nilai !== 'string' || !POLA_UUID.test(nilai)) throw new ErrorSigap(422, 'Percakapan tidak valid.');
    return nilai;
  }

  async denganBatasWaktu<T>(kerja: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const pengendali = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const habis = new Promise<never>((_, tolak) => {
      timer = setTimeout(() => {
        pengendali.abort();
        tolak(new ErrorSigap(504, 'Data registrasi BPOM sedang tidak dapat diakses.'));
      }, this.batasWaktuMs);
    });
    try {
      return await Promise.race([kerja(pengendali.signal), habis]);
    } catch (e) {
      if (e instanceof ErrorSigap) throw e;
      throw new ErrorSigap(502, 'Data registrasi BPOM sedang tidak dapat diakses.');
    } finally {
      clearTimeout(timer);
    }
  }

  // Gagal mencatat log tidak boleh menggagalkan jawaban ke penelepon. Bila percakapanId ditolak basis data
  // (misalnya percakapan tidak ada), log tetap disimpan tanpa percakapan agar panggilan gagal tetap terlihat.
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
