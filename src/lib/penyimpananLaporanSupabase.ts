// Adapter produksi PenyimpananLaporan: memanggil RPC rekap_layanan dan boleh_ekspor (T-F8.1-01) lewat REST dengan token
// sesi petugas, sehingga pemeriksaan petugas dan hak ekspor ditegakkan basis data (BR-8, NFR-14).
import type { HasilRekap, JumlahRekap, PenyimpananLaporan, Periode } from './LaporanController.ts';

type JumlahRpc = { panggilan: number; tereskalasi: number; pengaduan_selesai: number };
/** Keluaran rekap_layanan(p_awal, p_akhir) menurut kontrak T-F8.1-01: tiga total dan rincian per minggu WIB. */
type HasilRpc = { total: JumlahRpc; per_minggu: (JumlahRpc & { awal: string; akhir: string })[] | null };

const jumlah = (j: JumlahRpc): JumlahRekap => ({ panggilan: j.panggilan, tereskalasi: j.tereskalasi, pengaduanSelesai: j.pengaduan_selesai });

export class PenyimpananLaporanSupabase implements PenyimpananLaporan {
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

  async rpc<T>(nama: string, body: object): Promise<T> {
    const res = await this.fetch(`${this.url}/rest/v1/rpc/${nama}`, {
      method: 'POST',
      headers: { apikey: this.kunciPublik, Authorization: `Bearer ${this.tokenAkses}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status} pada rpc/${nama}`);
    return (await res.json()) as T;
  }

  async rekapLayanan({ awal, akhir }: Periode): Promise<HasilRekap> {
    const r = await this.rpc<HasilRpc>('rekap_layanan', { p_awal: awal, p_akhir: akhir });
    return { total: jumlah(r.total), perMinggu: (r.per_minggu ?? []).map((m) => ({ awal: m.awal, akhir: m.akhir, ...jumlah(m) })) };
  }

  async bolehEkspor(): Promise<boolean> {
    return (await this.rpc<unknown>('boleh_ekspor', {})) === true;
  }
}
