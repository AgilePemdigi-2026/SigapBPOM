export type MateriPengetahuan = {
  id: string;
  judul: string;
  kategori: string | null;
  rujukanSumber: string;
  diperbaruiPada: string;
  status: 'aktif' | 'tidak_aktif';
};

export interface PenyimpananBasisPengetahuan {
  daftar(): Promise<MateriPengetahuan[]>;
  nonaktifkan(materiId: string, petugasId: string): Promise<void>;
}

export class ErrorBasisPengetahuan extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class BasisPengetahuanController {
  penyimpanan: PenyimpananBasisPengetahuan;

  constructor(penyimpanan: PenyimpananBasisPengetahuan) {
    this.penyimpanan = penyimpanan;
  }

  daftar(): Promise<MateriPengetahuan[]> {
    return this.penyimpanan.daftar();
  }

  async nonaktifkan(input: { materiId?: unknown; petugasId?: unknown }): Promise<void> {
    if (typeof input.materiId !== 'string' || !POLA_UUID.test(input.materiId)) {
      throw new ErrorBasisPengetahuan(422, 'Materi tidak valid.');
    }
    if (typeof input.petugasId !== 'string' || !POLA_UUID.test(input.petugasId)) {
      throw new ErrorBasisPengetahuan(403, 'Akses ditolak.');
    }
    await this.penyimpanan.nonaktifkan(input.materiId, input.petugasId);
  }
}