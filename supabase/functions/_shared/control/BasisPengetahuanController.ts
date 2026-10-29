// Control UC-07 Mengelola Basis Pengetahuan: simpan dan indeks materi (F2.2, REQ-7.1, REQ-7.2, BR-4).
// Tidak memakai API khusus Deno agar bisa diuji dengan `node --test` tanpa basis data.
import type { PenyediaEmbedding } from '../adapter/embedding.ts';
import type { PenyimpananPengetahuan } from '../adapter/penyimpananPengetahuan.ts';
import type { MateriPengetahuan } from '../entity/materi.ts';
import { ErrorSigap } from './InformasiProdukController.ts';

/** Kamus pesan PRD-rinci Lampiran A (UC-07). */
export const PESAN_RUJUKAN_KOSONG = 'Rujukan sumber wajib diisi.';
export const PESAN_MATERI_TERSIMPAN = 'Materi siap digunakan sistem.';
export const PESAN_JUDUL_KOSONG = 'Judul materi wajib diisi.';

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ukuran chunk dan overlap untuk pemotongan teks edukasi RAG (10-20% overlap).
 * Default: 500 karakter dengan 100 karakter overlap (20%).
 */
export const UKURAN_CHUNK_DEFAULT = 500;
export const OVERLAP_CHUNK_DEFAULT = 100;

/**
 * Memotong teks menjadi potongan-potongan dengan overlap 10-20% dari ukuran chunk.
 * Mengutamakan pemisahan pada batas kata (spasi/baris baru) agar teks tidak terpotong canggung.
 */
export function potongTeks(
  teks: string,
  ukuranChunk = UKURAN_CHUNK_DEFAULT,
  overlap = OVERLAP_CHUNK_DEFAULT,
): string[] {
  const bersih = teks.trim();
  if (!bersih) return [];
  if (bersih.length <= ukuranChunk) return [bersih];

  const potongan: string[] = [];
  let awal = 0;

  while (awal < bersih.length) {
    let akhir = awal + ukuranChunk;
    if (akhir >= bersih.length) {
      const sisa = bersih.slice(awal).trim();
      if (sisa) potongan.push(sisa);
      break;
    }

    // Cari pemisah kata terdekat sebelum batas akhir
    const batasSpasi = bersih.lastIndexOf(' ', akhir);
    if (batasSpasi > awal + overlap) {
      akhir = batasSpasi;
    }

    const chunk = bersih.slice(awal, akhir).trim();
    if (chunk) {
      potongan.push(chunk);
    }

    const maju = Math.max(1, akhir - overlap);
    awal = maju;
  }

  return potongan.filter((p) => p.length > 0);
}

export interface InputTambahMateri {
  judul?: unknown;
  kategori?: unknown;
  isi?: unknown;
  rujukan?: unknown;
  rujukan_sumber?: unknown;
  rujukanSumber?: unknown;
  diperbarui_oleh?: unknown;
  diperbaruiOleh?: unknown;
}

export class BasisPengetahuanController {
  penyediaEmbedding: PenyediaEmbedding;
  penyimpanan: PenyimpananPengetahuan;

  constructor(
    penyediaEmbedding: PenyediaEmbedding,
    penyimpanan: PenyimpananPengetahuan,
  ) {
    this.penyediaEmbedding = penyediaEmbedding;
    this.penyimpanan = penyimpanan;
  }

  /**
   * REQ-7.1, REQ-7.2, BR-4: Menyimpan materi aktif ke basis pengetahuan.
   * Validasi rujukan sumber dan judul di server.
   * Melakukan pemotongan teks (chunking) ber-overlap dan membuat embedding.
   * Bila pengindeksan gagal, materi TETAP tersimpan dengan terindeks = false.
   */
  async tambahMateri(input: InputTambahMateri): Promise<MateriPengetahuan> {
    const judul = typeof input.judul === 'string' ? input.judul.trim() : '';
    if (!judul) {
      throw new ErrorSigap(422, PESAN_JUDUL_KOSONG);
    }

    // Mendukung beberapa nama field rujukan sumber untuk kemudahan formulir
    const rujukanMentah = input.rujukan ?? input.rujukan_sumber ?? input.rujukanSumber;
    const rujukan = typeof rujukanMentah === 'string' ? rujukanMentah.trim() : '';
    if (!rujukan) {
      // BR-4, REQ-7.2: Rujukan sumber wajib diisi.
      throw new ErrorSigap(422, PESAN_RUJUKAN_KOSONG);
    }

    const kategori = typeof input.kategori === 'string' && input.kategori.trim() ? input.kategori.trim() : null;
    const isi = typeof input.isi === 'string' ? input.isi.trim() : '';

    const diperbaruiOlehMentah = input.diperbarui_oleh ?? input.diperbaruiOleh;
    const diperbaruiOleh = typeof diperbaruiOlehMentah === 'string' && POLA_UUID.test(diperbaruiOlehMentah)
      ? diperbaruiOlehMentah
      : null;

    const diperbaruiPada = new Date().toISOString();

    // 1. Simpan materi berstatus aktif dengan terindeks = false terlebih dahulu
    const materiTersimpan = await this.penyimpanan.simpanMateri({
      judul,
      kategori,
      rujukan_sumber: rujukan,
      isi,
      status: 'aktif',
      terindeks: false,
      diperbarui_oleh: diperbaruiOleh,
      diperbarui_pada: diperbaruiPada,
    });

    // 2. Potong teks dan buat embedding
    if (!isi) {
      return materiTersimpan;
    }

    try {
      const potongan = potongTeks(isi);
      if (potongan.length > 0) {
        const daftarPotongan = [];
        for (const teksChunk of potongan) {
          const embedding = await this.penyediaEmbedding.buatEmbedding(teksChunk);
          daftarPotongan.push({
            materi_id: materiTersimpan.id,
            teks: teksChunk,
            embedding,
          });
        }

        await this.penyimpanan.simpanPotongan(daftarPotongan);
        await this.penyimpanan.perbaruiStatusTerindeks(materiTersimpan.id, true);
        materiTersimpan.terindeks = true;
      }
    } catch (galat) {
      // Bila pengindeksan gagal, materi tetap tersimpan dengan terindeks = false
      console.error('pengindeksan materi gagal, materi tetap tersimpan:', galat);
      materiTersimpan.terindeks = false;
    }

    return materiTersimpan;
  }
}
