// Control UC-04 Memantau Layanan: pencatatan panggilan aktif dari Voice Gateway (T-F5.2-02, REQ-4.2).
// Tidak memakai API khusus Deno agar bisa diuji dengan `node --test` tanpa basis data.
// Tidak menerima transkrip atau nomor telepon: hanya jenis layanan, topik singkat, dan tahap pemrosesan AI.
import { ErrorSigap } from './InformasiProdukController.ts';

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PANJANG_MAKS_TOPIK = 80;

/** Tahap pemrosesan AI pada panggilan berjalan (REQ-4.2). */
export const TAHAP_AI = ['mendengar', 'memproses', 'menjawab'] as const;
export type TahapAi = (typeof TAHAP_AI)[number];

export const JENIS_LAYANAN = ['informasi_produk', 'pengaduan'] as const;
export type JenisLayanan = (typeof JENIS_LAYANAN)[number];

export interface PenyimpananPemantauan {
  laporkanPanggilanAktif(data: { percakapanId: string; jenisLayanan: JenisLayanan | null; topik: string | null; tahap: TahapAi | null }): Promise<void>;
  /** Mengembalikan true bila ada panggilan berjalan yang ditutup. */
  akhiriPanggilanAktif(percakapanId: string): Promise<boolean>;
}

// Pesan di bawah adalah pesan API internal (dibaca gateway, bukan penelepon), lihat PRD-rinci Lampiran A "Pengecualian pesan API internal".
export class PemantauanLayananController {
  penyimpanan: PenyimpananPemantauan;

  constructor(penyimpanan: PenyimpananPemantauan) {
    this.penyimpanan = penyimpanan;
  }

  /** { aksi: 'laporkan' | 'akhiri', percakapanId, jenisLayanan?, topik?, tahap? } -> { tersimpan } atau { ditutup } */
  async proses(input: Record<string, unknown>): Promise<{ tersimpan: true } | { ditutup: boolean }> {
    if (typeof input.percakapanId !== 'string' || !POLA_UUID.test(input.percakapanId)) {
      throw new ErrorSigap(422, 'Percakapan tidak valid.');
    }
    const percakapanId = input.percakapanId.toLowerCase();

    if (input.aksi === 'akhiri') {
      return { ditutup: await this.penyimpanan.akhiriPanggilanAktif(percakapanId) };
    }
    if (input.aksi !== 'laporkan') throw new ErrorSigap(422, 'Aksi tidak dikenal.');

    const tahap = input.tahap ?? null;
    if (tahap !== null && !TAHAP_AI.includes(tahap as TahapAi)) throw new ErrorSigap(422, 'Tahap tidak valid.');
    const jenisLayanan = input.jenisLayanan ?? null;
    if (jenisLayanan !== null && !JENIS_LAYANAN.includes(jenisLayanan as JenisLayanan)) {
      throw new ErrorSigap(422, 'Jenis layanan tidak valid.');
    }
    let topik: string | null = null;
    if (input.topik !== undefined && input.topik !== null) {
      if (typeof input.topik !== 'string') throw new ErrorSigap(422, 'Topik tidak valid.');
      topik = input.topik.trim().slice(0, PANJANG_MAKS_TOPIK) || null;
    }

    await this.penyimpanan.laporkanPanggilanAktif({
      percakapanId,
      jenisLayanan: jenisLayanan as JenisLayanan | null,
      topik,
      tahap: tahap as TahapAi | null,
    });
    return { tersimpan: true };
  }
}
