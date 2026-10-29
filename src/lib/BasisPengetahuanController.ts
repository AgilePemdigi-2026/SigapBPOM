// Control UC-07 Mengelola Basis Pengetahuan: nonaktifkan materi (REQ-7.3, BR-5).
// Nama kelas mengikuti class diagram SRS (PROJECT_RULES 4.1).

/** Kamus pesan PRD-rinci Lampiran A, UC-07. */
export const PESAN_MATERI = {
  tersimpan: 'Materi siap digunakan sistem.',
  dinonaktifkan: 'Materi ditandai tidak aktif.',
  rujukanKosong: 'Rujukan sumber wajib diisi.',
  tidakDitemukan: 'Materi tidak ditemukan.',
} as const;

export type InfoPembaruanMateri = {
  materiId: string;
  status: 'aktif' | 'tidak_aktif';
  diperbaruiOleh: string;
  diperbaruiPada: Date;
};

export type PotonganPencarian = {
  id: string;
  materiId: string;
  teks: string;
  judul: string;
  rujukanSumber: string;
  skor: number;
};

/** Adapter penyimpanan materi: tiruan untuk pengujian/lokal, Supabase di produksi (PROJECT_RULES 4.3). */
export interface PenyimpananMateri {
  /**
   * Mengubah status materi menjadi 'tidak_aktif', mencatat siapa (petugas) dan kapan.
   * Tidak ada DELETE (BR-5). Mengembalikan true jika berhasil.
   */
  nonaktifkan(materiId: string, petugasId: string): Promise<boolean>;

  /** Memeriksa apakah materi berstatus tidak aktif. */
  apakahNonaktif?(materiId: string): boolean | Promise<boolean>;

  /** Mengambil catatan pembaruan materi. */
  ambilPembaruan?(materiId: string): Promise<InfoPembaruanMateri | null>;

  /** Pencarian potongan materi untuk RAG (mengabaikan materi tidak aktif). */
  cariPotongan?(queryEmbedding: number[], ambangKemiripan?: number, batas?: number): Promise<PotonganPencarian[]>;
}

export class BasisPengetahuanController {
  penyimpanan: PenyimpananMateri;

  constructor(penyimpanan: PenyimpananMateri) {
    this.penyimpanan = penyimpanan;
  }

  /**
   * REQ-7.3, BR-5: materi usang ditandai tidak aktif, tidak dihapus permanen,
   * dan tidak lagi dipakai sebagai sumber jawaban.
   * Mencatat status 'tidak_aktif', diperbarui_oleh, dan diperbarui_pada lewat sesi petugas.
   */
  async nonaktifkanMateri(materiId: string, petugasId: string): Promise<{ berhasil: boolean; pesan: string }> {
    if (!materiId || !materiId.trim()) {
      return { berhasil: false, pesan: PESAN_MATERI.tidakDitemukan };
    }
    if (!petugasId || !petugasId.trim()) {
      return { berhasil: false, pesan: 'Akses ditolak.' };
    }

    const berhasil = await this.penyimpanan.nonaktifkan(materiId.trim(), petugasId.trim());
    if (!berhasil) {
      return { berhasil: false, pesan: PESAN_MATERI.tidakDitemukan };
    }

    return { berhasil: true, pesan: PESAN_MATERI.dinonaktifkan };
  }

  /**
   * REQ-7.3: Pencarian potongan materi aktif untuk RAG.
   * Potongan dari materi berstatus 'tidak_aktif' tidak pernah dikembalikan.
   */
  async cariPotongan(queryEmbedding: number[], ambangKemiripan = 0.5, batas = 5): Promise<PotonganPencarian[]> {
    if (!this.penyimpanan.cariPotongan) return [];
    return this.penyimpanan.cariPotongan(queryEmbedding, ambangKemiripan, batas);
  }
}
