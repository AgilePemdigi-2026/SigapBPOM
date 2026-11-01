// Adapter produksi PenyimpananMateri: membaca Supabase lewat REST dengan token sesi petugas, sehingga RLS
// is_petugas() berlaku (T-F2.1-03). Token didapat dari Supabase Auth setelah T-F3.1-03.
import type { KueriPenyimpanan, MateriTersimpan, PenyimpananMateri, StatusMateri } from './BasisPengetahuanController.ts';

type BarisMateri = { id: string; judul: string; kategori: string | null; rujukan_sumber: string; status: StatusMateri; diperbarui_pada: string };

// Karakter yang punya arti khusus di filter PostgREST atau pola ILIKE dibuang dari kata kunci.
const bersihkan = (cari: string) => cari.replace(/[\\"*%_,()]/g, ' ').trim();

export class PenyimpananMateriSupabase implements PenyimpananMateri {
  url: string;
  kunciPublik: string;
  tokenAkses: string;
  fetch: typeof fetch;

  constructor(opsi: { url: string; kunciPublik: string; tokenAkses: string; fetch?: typeof fetch }) {
    this.url = opsi.url.replace(/\/+$/, '');
    this.kunciPublik = opsi.kunciPublik;
    this.tokenAkses = opsi.tokenAkses;
    this.fetch = opsi.fetch ?? globalThis.fetch;
  }

  async ambil(path: string, header: Record<string, string> = {}) {
    const res = await this.fetch(`${this.url}/rest/v1/${path}`, {
      headers: { apikey: this.kunciPublik, Authorization: `Bearer ${this.tokenAkses}`, ...header },
    });
    // 416 berarti halaman di luar jangkauan: bukan kegagalan, hasilnya kosong.
    if (!res.ok && res.status !== 416) throw new Error(`Supabase ${res.status} pada ${path.split('?')[0]}`);
    return res;
  }

  async daftar({ status, cari, offset, batas }: KueriPenyimpanan) {
    const p = new URLSearchParams({
      select: 'id,judul,kategori,rujukan_sumber,status,diperbarui_pada',
      order: 'diperbarui_pada.desc,judul.asc',
      offset: String(offset),
      limit: String(batas),
    });
    if (status) p.set('status', `eq.${status}`);
    const kata = cari ? bersihkan(cari) : '';
    if (kata) p.set('or', `(judul.ilike.*${kata}*,rujukan_sumber.ilike.*${kata}*)`);

    const res = await this.ambil(`materi_pengetahuan?${p}`, { Prefer: 'count=exact' });
    const baris = res.status === 416 ? [] : ((await res.json()) as BarisMateri[]);
    // Content-Range berbentuk "0-24/765", atau "*/765" bila halaman di luar jangkauan.
    const total = Number(res.headers.get('content-range')?.split('/')[1]);
    return {
      baris: baris.map((b): MateriTersimpan => ({
        id: b.id,
        judul: b.judul,
        kategori: b.kategori ?? 'Edukasi Umum',
        rujukanSumber: b.rujukan_sumber,
        status: b.status,
        diperbaruiPada: b.diperbarui_pada,
      })),
      total: Number.isFinite(total) ? total : baris.length,
    };
  }

  async potongan(materiIds: string[]) {
    if (!materiIds.length) return {};
    const p = new URLSearchParams({ select: 'materi_id,teks', materi_id: `in.(${materiIds.join(',')})`, order: 'id' });
    const baris = (await (await this.ambil(`materi_potongan?${p}`)).json()) as { materi_id: string; teks: string }[];
    const hasil: Record<string, string[]> = {};
    for (const b of baris) (hasil[b.materi_id] ??= []).push(b.teks);
    return hasil;
  }
}
