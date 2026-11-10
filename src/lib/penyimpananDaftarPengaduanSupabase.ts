// Adapter produksi PenyimpananDaftarPengaduan (T-F7.1-02): membaca view detail_pengaduan_tiket dan tabel percakapan
// lewat REST dengan token sesi petugas, sehingga is_petugas() dan RLS berlaku. Hanya kolom yang tampil di Daftar
// Pengaduan yang diminta; kolom data pribadi pelapor dan kronologi tidak pernah diminta (PROJECT_RULES 5.5).
import type { PengaduanTersimpan, PengaduanTidakLengkap, PenyimpananDaftarPengaduan } from './daftarPengaduan.ts';

type BarisTiket = { no_tiket: string; nama_produk_diadukan: string | null; tgl_pengaduan: string | null; tgl_terbit: string; status_tiket: string; percakapan_id: string | null };

export class PenyimpananDaftarPengaduanSupabase implements PenyimpananDaftarPengaduan {
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

  async json<T>(path: string) {
    const res = await this.fetch(`${this.url}/rest/v1/${path}`, { headers: { apikey: this.kunciPublik, Authorization: `Bearer ${this.tokenAkses}` } });
    if (!res.ok) throw new Error(`Supabase ${res.status} pada ${path.split('?')[0]}`);
    return (await res.json()) as T;
  }

  /** Kategori pengaduan adalah topik percakapan, sama seperti persentase kategori di Ringkasan Layanan. */
  async topik(ids: string[]) {
    if (!ids.length) return new Map<string, string | null>();
    const p = new URLSearchParams({ select: 'id,topik', id: `in.(${ids.join(',')})` });
    const baris = await this.json<{ id: string; topik: string | null }[]>(`percakapan?${p}`);
    return new Map(baris.map((b) => [b.id, b.topik]));
  }

  async daftar(): Promise<PengaduanTersimpan[]> {
    const p = new URLSearchParams({
      select: 'no_tiket,nama_produk_diadukan,tgl_pengaduan,tgl_terbit,status_tiket,percakapan_id',
      jenis_tiket: 'eq.pengaduan',
      order: 'tgl_terbit.desc',
    });
    const baris = await this.json<BarisTiket[]>(`detail_pengaduan_tiket?${p}`);
    // View menggabungkan pengaduan lewat tiket_id atau percakapan_id; satu tiket tetap satu baris.
    const unik = [...new Map(baris.map((b) => [b.no_tiket, b])).values()];
    const topik = await this.topik([...new Set(unik.flatMap((b) => (b.percakapan_id ? [b.percakapan_id] : [])))]);
    return unik.map((b) => ({
      noTiket: b.no_tiket,
      namaProduk: b.nama_produk_diadukan,
      kategori: (b.percakapan_id && topik.get(b.percakapan_id)) || null,
      tglPengaduan: b.tgl_pengaduan ?? b.tgl_terbit,
      status: b.status_tiket,
    }));
  }

  async tidakLengkap(): Promise<PengaduanTidakLengkap[]> {
    const p = new URLSearchParams({ select: 'id,topik,waktu_mulai', status_penyelesaian: 'eq.pengaduan_tidak_lengkap', order: 'waktu_mulai.desc' });
    const baris = await this.json<{ id: string; topik: string | null; waktu_mulai: string }[]>(`percakapan?${p}`);
    return baris.map((b) => ({ percakapanId: b.id, kategori: b.topik, waktu: b.waktu_mulai }));
  }
}
