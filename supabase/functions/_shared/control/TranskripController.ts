// Control UC-01 register layanan: Voice Gateway mencatat transkrip percakapan (T-F1.1-03, T-F1.1-05, NFR-20) dan pemanggilan
// tool yang dijalankannya atas nama agen (T-F5.4-01). Tidak memakai API khusus Deno agar bisa diuji dengan `node --test`.
// Pembacaan transkrip oleh petugas adalah UC-05 (Sprint 3) dan belum ada di sini.
import { samarkanNomorTelepon } from '../entity/penelepon.ts';
import { PEMBICARA, type Pembicara } from '../entity/ucapan.ts';
import { ErrorSigap, type LogTool } from './InformasiProdukController.ts';

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Batas satu ucapan, sama dengan fungsi catat_ucapan. Gateway memotong ucapan di 1.000 karakter dan jawaban di 450. */
export const PANJANG_MAKS_TEKS_UCAPAN = 2000;
/** Batas ringkasan percakapan, sama dengan fungsi simpan_ringkasan_percakapan dan voice-gateway/ringkasan.mjs. */
export const PANJANG_MAKS_RINGKASAN = 500;
/** Tool yang dijalankan gateway sendiri (voice-gateway/alatCekRegistrasi.mjs, alatPengetahuan.mjs). */
export const TOOL_GATEWAY = ['cek_registrasi_bpom', 'cari_basis_pengetahuan'] as const;
const DURASI_MAKS_MS = 10 * 60_000;

export interface PenyimpananTranskrip {
  /** Mengembalikan urutan ucapan dalam percakapan; melempar ErrorSigap 404 bila percakapan tidak ada. */
  catatUcapan(data: { percakapanId: string; pembicara: Pembicara; teks: string }): Promise<number>;
  catatLogTool(log: LogTool): Promise<void>;
  /** Menyimpan ringkasan buatan AI ke percakapan.ringkasan; melempar ErrorSigap 404 bila percakapan tidak ada. */
  simpanRingkasan(data: { percakapanId: string; ringkasan: string }): Promise<void>;
}

// Pesan di bawah adalah pesan API internal (dibaca gateway, bukan penelepon), lihat PRD-rinci Lampiran A "Pengecualian pesan API internal".
export class TranskripController {
  penyimpanan: PenyimpananTranskrip;

  constructor(penyimpanan: PenyimpananTranskrip) {
    this.penyimpanan = penyimpanan;
  }

  /** { percakapanId, pembicara, teks } -> { urutan }. Nomor telepon disamarkan sebelum disimpan (NFR-13). */
  async simpanUcapan(input: Record<string, unknown>): Promise<{ urutan: number }> {
    const percakapanId = percakapanIdSah(input);
    if (!PEMBICARA.includes(input.pembicara as Pembicara)) throw new ErrorSigap(422, 'Pembicara tidak valid.');
    const teks = typeof input.teks === 'string' ? input.teks.trim() : '';
    if (!teks || teks.length > PANJANG_MAKS_TEKS_UCAPAN) throw new ErrorSigap(422, 'Teks ucapan tidak valid.');
    const urutan = await this.penyimpanan.catatUcapan({ percakapanId, pembicara: input.pembicara as Pembicara, teks: samarkanNomorTelepon(teks) });
    return { urutan };
  }

  /** { percakapanId, namaTool, durasiMs, berhasil } -> { tersimpan }. Argumen dan hasil tool tidak pernah diterima. */
  async catatPemanggilanTool(input: Record<string, unknown>): Promise<{ tersimpan: true }> {
    const percakapanId = percakapanIdSah(input);
    if (!TOOL_GATEWAY.includes(input.namaTool as (typeof TOOL_GATEWAY)[number])) throw new ErrorSigap(422, 'Nama tool tidak valid.');
    const durasiMs = input.durasiMs;
    if (typeof durasiMs !== 'number' || !Number.isFinite(durasiMs) || durasiMs < 0 || durasiMs > DURASI_MAKS_MS) {
      throw new ErrorSigap(422, 'Durasi tidak valid.');
    }
    if (typeof input.berhasil !== 'boolean') throw new ErrorSigap(422, 'Hasil tool tidak valid.');
    await this.penyimpanan.catatLogTool({ percakapanId, namaTool: input.namaTool as string, durasiMs: Math.round(durasiMs), berhasil: input.berhasil });
    return { tersimpan: true };
  }

  /**
   * { percakapanId, ringkasan } -> { tersimpan } (T-F6.3-01, REQ-5.2). Ringkasan buatan AI disusun gateway setelah panggilan
   * berakhir; nomor telepon disamarkan sekali lagi di sini sebelum disimpan (NFR-13).
   */
  async simpanRingkasan(input: Record<string, unknown>): Promise<{ tersimpan: true }> {
    const percakapanId = percakapanIdSah(input);
    const ringkasan = typeof input.ringkasan === 'string' ? input.ringkasan.replace(/\s+/g, ' ').trim() : '';
    if (!ringkasan || ringkasan.length > PANJANG_MAKS_RINGKASAN) throw new ErrorSigap(422, 'Ringkasan tidak valid.');
    await this.penyimpanan.simpanRingkasan({ percakapanId, ringkasan: samarkanNomorTelepon(ringkasan) });
    return { tersimpan: true };
  }
}

function percakapanIdSah(input: Record<string, unknown>): string {
  if (typeof input.percakapanId !== 'string' || !POLA_UUID.test(input.percakapanId)) {
    throw new ErrorSigap(422, 'Percakapan tidak valid.');
  }
  return input.percakapanId.toLowerCase();
}
