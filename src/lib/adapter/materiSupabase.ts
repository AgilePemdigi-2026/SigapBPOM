import type { MateriPengetahuan, PenyimpananBasisPengetahuan } from '../control/BasisPengetahuanController';

type BarisMateri = {
  id: string;
  judul: string;
  kategori: string | null;
  rujukan_sumber: string;
  diperbarui_pada: string;
  status: 'aktif' | 'tidak_aktif';
};

export class MateriSupabase implements PenyimpananBasisPengetahuan {
  url: string;
  kunci: string;

  constructor(url = process.env.SUPABASE_URL, kunci = process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (!url || !kunci) throw new Error('Konfigurasi Supabase tidak tersedia.');
    this.url = url.replace(/\/$/, '');
    this.kunci = kunci;
  }

  async daftar(): Promise<MateriPengetahuan[]> {
    const response = await fetch(`${this.url}/rest/v1/materi_pengetahuan?select=id,judul,kategori,rujukan_sumber,diperbarui_pada,status&order=diperbarui_pada.desc`, {
      headers: this.headers(),
    });
    if (!response.ok) throw new Error(`Daftar materi gagal dimuat (${response.status}).`);
    const rows = await response.json() as BarisMateri[];
    return rows.map((row) => ({
      id: row.id,
      judul: row.judul,
      kategori: row.kategori,
      rujukanSumber: row.rujukan_sumber,
      diperbaruiPada: row.diperbarui_pada,
      status: row.status,
    }));
  }

  async nonaktifkan(materiId: string, petugasId: string): Promise<void> {
    const response = await fetch(`${this.url}/rest/v1/rpc/nonaktifkan_materi`, {
      method: 'POST',
      headers: { ...this.headers(), 'content-type': 'application/json' },
      body: JSON.stringify({ p_materi_id: materiId, p_petugas_id: petugasId }),
    });
    if (response.status === 404) throw new Error('Materi tidak ditemukan.');
    if (!response.ok) throw new Error(`Materi gagal dinonaktifkan (${response.status}).`);
  }

  headers(): HeadersInit {
    return { apikey: this.kunci, authorization: `Bearer ${this.kunci}` };
  }
}