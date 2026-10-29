// Entity Materi_Pengetahuan dan Materi_Potongan (SRS Appendix B, REQ-7.1, BR-4, BR-5).

export type StatusMateri = 'aktif' | 'tidak_aktif';

export interface MateriPengetahuan {
  id: string;
  judul: string;
  kategori: string | null;
  rujukan_sumber: string;
  isi: string;
  status: StatusMateri;
  terindeks: boolean;
  diperbarui_oleh: string | null;
  diperbarui_pada: string;
}

export interface MateriPotongan {
  id: string;
  materi_id: string;
  teks: string;
  embedding: number[];
}
