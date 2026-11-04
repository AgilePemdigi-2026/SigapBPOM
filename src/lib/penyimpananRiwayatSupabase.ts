// Adapter produksi PenyimpananRiwayat: membaca view riwayat_percakapan (T-F6.1-01) lewat REST dengan token sesi petugas,
// sehingga filter is_petugas() di view berlaku (T-F6.1-02). Ringkasan periode dihitung dari view yang sama memakai
// count=exact, jadi angkanya selalu cocok dengan daftar.
import type { PenyimpananRiwayat, PercakapanTersimpan, Periode, RingkasanPeriode } from './TranskripController.ts';

type BarisRiwayat = {
  id: string;
  waktu_mulai: string;
  jenis_interaksi: string | null;
  ringkasan: string | null;
  status_penyelesaian: string;
};

const KOLOM = 'id,waktu_mulai,jenis_interaksi,ringkasan,status_penyelesaian';

export class PenyimpananRiwayatSupabase implements PenyimpananRiwayat {
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

  /** Percakapan berakhir dalam periode, ditambah filter lain bila ada. */
  kueri(periode: Periode, filter: Record<string, string> = {}) {
    const p = new URLSearchParams(filter);
    p.append('waktu_mulai', `gte.${periode.dari}`);
    p.append('waktu_mulai', `lt.${periode.sampai}`);
    p.append('status_penyelesaian', 'neq.berjalan');
    return p;
  }

  async ambil(p: URLSearchParams, method = 'GET', header: Record<string, string> = {}) {
    const res = await this.fetch(`${this.url}/rest/v1/riwayat_percakapan?${p}`, {
      method,
      headers: { apikey: this.kunciPublik, Authorization: `Bearer ${this.tokenAkses}`, ...header },
    });
    // 416 berarti halaman di luar jangkauan: bukan kegagalan, hasilnya kosong.
    if (!res.ok && res.status !== 416) throw new Error(`Supabase ${res.status} pada riwayat_percakapan`);
    return res;
  }

  async hitung(p: URLSearchParams) {
    p.set('select', 'id');
    const res = await this.ambil(p, 'HEAD', { Prefer: 'count=exact' });
    // Content-Range berbentuk "0-24/765", atau "*/0" bila kosong.
    const total = Number(res.headers.get('content-range')?.split('/')[1]);
    if (!Number.isFinite(total)) throw new Error('Supabase tidak mengirim jumlah baris riwayat_percakapan');
    return total;
  }

  async daftar({ periode, jenis, offset, batas }: { periode: Periode; jenis?: string; offset: number; batas: number }): Promise<PercakapanTersimpan[]> {
    const filter: Record<string, string> = { select: KOLOM, order: 'waktu_mulai.desc,id.desc', offset: String(offset), limit: String(batas) };
    if (jenis) filter.jenis_interaksi = `eq.${jenis}`;
    const res = await this.ambil(this.kueri(periode, filter));
    if (res.status === 416) return [];
    return ((await res.json()) as BarisRiwayat[]).map((b) => ({
      id: b.id,
      waktuMulai: b.waktu_mulai,
      jenisInteraksi: b.jenis_interaksi,
      ringkasan: b.ringkasan,
      statusPenyelesaian: b.status_penyelesaian,
    }));
  }

  async ringkasan(periode: Periode): Promise<RingkasanPeriode> {
    const [total, informasiProduk, pengaduanProduk, dieskalasi] = await Promise.all([
      this.hitung(this.kueri(periode)),
      this.hitung(this.kueri(periode, { jenis_interaksi: 'eq.informasi_produk' })),
      this.hitung(this.kueri(periode, { jenis_interaksi: 'eq.pengaduan' })),
      this.hitung(this.kueri(periode, { status_penyelesaian: 'eq.dieskalasi' })),
    ]);
    return { total, informasiProduk, pengaduanProduk, dieskalasi };
  }
}
