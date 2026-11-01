// Adapter produksi PenyimpananPemantauan dan PenyimpananPengaduan: membaca Supabase lewat REST dengan token sesi
// petugas, sehingga RLS petugas berlaku (T-F5.1-02, T-F5.2-01, T-F5.3-03, T-F5.4-01). Akses baca tabel
// percakapan, tiket, log_tool, dan view penelepon_tersamar dibuka di T-F5.3-01; token sesi datang dari T-F3.1-03.
import {
  HARI_KATEGORI,
  awalHariWib,
  awalHariWibMundur,
  type JenisInteraksi,
  type JenisTiket,
  type LogToolTersimpan,
  type PanggilanTersimpan,
  type PenyimpananPemantauan,
  type StatusTiket,
} from './PemantauanLayananController.ts';
import type { PengaduanTersimpan, PenyimpananPengaduan } from './PengaduanController.ts';

// Batas baris topik yang dihitung per kategori; PostgREST di Supabase tidak membuka agregasi GROUP BY.
const BATAS_BARIS_KATEGORI = 5000;

type BarisTiket = {
  no_tiket: string;
  jenis: JenisTiket;
  status: StatusTiket;
  ringkasan: string | null;
  tgl_terbit: string;
  percakapan_id: string;
  percakapan: { waktu_mulai: string; jenis_interaksi: JenisInteraksi | null; topik: string | null; penelepon_id: string | null } | null;
};

export class PenyimpananPemantauanSupabase implements PenyimpananPemantauan, PenyimpananPengaduan {
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

  async ambil(path: string, init: { method?: string; header?: Record<string, string> } = {}) {
    const res = await this.fetch(`${this.url}/rest/v1/${path}`, {
      method: init.method ?? 'GET',
      headers: { apikey: this.kunciPublik, Authorization: `Bearer ${this.tokenAkses}`, ...init.header },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status} pada ${path.split('?')[0]}`);
    return res;
  }

  async json<T>(path: string) {
    return (await (await this.ambil(path)).json()) as T;
  }

  /** Jumlah baris yang cocok, dari Content-Range "*\/N" tanpa mengunduh barisnya. */
  async hitung(tabel: string, filter: Record<string, string>) {
    const res = await this.ambil(`${tabel}?${new URLSearchParams({ select: 'id', ...filter })}`, { method: 'HEAD', header: { Prefer: 'count=exact' } });
    const total = Number(res.headers.get('content-range')?.split('/')[1]);
    if (!Number.isFinite(total)) throw new Error(`Supabase tanpa jumlah baris pada ${tabel}`);
    return total;
  }

  async statistik(sekarang: Date) {
    const hariIni = awalHariWib(sekarang);
    const tujuhHari = awalHariWibMundur(sekarang, HARI_KATEGORI);
    const [panggilanHariIni, dijawabAi, tiketEskalasiBaru, tiketBelumDitelaah, pengaduanSelesai, panggilanBerjalan, topik] = await Promise.all([
      this.hitung('percakapan', { waktu_mulai: `gte.${hariIni}` }),
      this.hitung('percakapan', { waktu_mulai: `gte.${hariIni}`, status_penyelesaian: 'eq.selesai_ai' }),
      this.hitung('tiket', { jenis: 'eq.eskalasi', tgl_terbit: `gte.${hariIni}` }),
      this.hitung('tiket', { status: 'eq.belum_ditelaah' }),
      this.hitung('tiket', { jenis: 'eq.pengaduan', status: 'eq.selesai', tgl_terbit: `gte.${tujuhHari}` }),
      this.hitung('percakapan', { status_penyelesaian: 'eq.berjalan' }),
      this.json<{ topik: string }[]>(
        `percakapan?${new URLSearchParams({ select: 'topik', waktu_mulai: `gte.${tujuhHari}`, topik: 'not.is.null', limit: String(BATAS_BARIS_KATEGORI) })}`,
      ),
    ]);
    const kategori = new Map<string, number>();
    for (const { topik: k } of topik) kategori.set(k, (kategori.get(k) ?? 0) + 1);
    return {
      panggilanHariIni,
      dijawabAi,
      tiketEskalasiBaru,
      tiketBelumDitelaah,
      pengaduanSelesai,
      panggilanBerjalan,
      kategori: [...kategori].map(([k, jumlah]) => ({ kategori: k, jumlah })),
    };
  }

  async kasusTindakLanjut(batas: number) {
    const p = new URLSearchParams({ select: 'no_tiket,jenis,ringkasan,tgl_terbit', status: 'eq.belum_ditelaah', order: 'tgl_terbit.desc', limit: String(batas) });
    const baris = await this.json<{ no_tiket: string; jenis: JenisTiket; ringkasan: string | null; tgl_terbit: string }[]>(`tiket?${p}`);
    return baris.map((b) => ({ noTiket: b.no_tiket, jenis: b.jenis, ringkasan: b.ringkasan ?? '', tglTerbit: b.tgl_terbit }));
  }

  /** Nomor dan nama tersamar per penelepon; nomor lengkap tidak pernah diminta (PROJECT_RULES 5.5). */
  async penelepon(ids: string[]) {
    if (!ids.length) return new Map<string, { nama_pelapor: string | null; no_telp: string | null }>();
    const p = new URLSearchParams({ select: 'id,nama_pelapor,no_telp', id: `in.(${ids.join(',')})` });
    const baris = await this.json<{ id: string; nama_pelapor: string | null; no_telp: string | null }[]>(`penelepon_tersamar?${p}`);
    return new Map(baris.map((b) => [b.id, b]));
  }

  async panggilanAktif(): Promise<PanggilanTersimpan[]> {
    const p = new URLSearchParams({
      select: 'id,penelepon_id,jenis_interaksi,topik,waktu_mulai,tahap_ai',
      status_penyelesaian: 'eq.berjalan',
      order: 'waktu_mulai.asc',
    });
    const baris = await this.json<{ id: string; penelepon_id: string | null; jenis_interaksi: JenisInteraksi | null; topik: string | null; waktu_mulai: string; tahap_ai: string | null }[]>(
      `percakapan?${p}`,
    );
    const penelepon = await this.penelepon([...new Set(baris.flatMap((b) => (b.penelepon_id ? [b.penelepon_id] : [])))]);
    return baris.map((b) => ({
      id: b.id,
      noTelp: (b.penelepon_id && penelepon.get(b.penelepon_id)?.no_telp) || null,
      jenisInteraksi: b.jenis_interaksi,
      topik: b.topik,
      waktuMulai: b.waktu_mulai,
      tahapAi: b.tahap_ai,
    }));
  }

  async logToolTerbaru(batas: number): Promise<LogToolTersimpan[]> {
    const p = new URLSearchParams({ select: 'id,nama_tool,durasi_ms,berhasil,waktu', order: 'waktu.desc,id.desc', limit: String(batas) });
    const baris = await this.json<{ id: number; nama_tool: string; durasi_ms: number; berhasil: boolean; waktu: string }[]>(`log_tool?${p}`);
    return baris.map((b) => ({ id: b.id, namaTool: b.nama_tool, durasiMs: b.durasi_ms, berhasil: b.berhasil, waktu: b.waktu }));
  }

  async detail(noTiket: string): Promise<PengaduanTersimpan | null> {
    const p = new URLSearchParams({
      select: 'no_tiket,jenis,status,ringkasan,tgl_terbit,percakapan_id,percakapan(waktu_mulai,jenis_interaksi,topik,penelepon_id)',
      no_tiket: `eq.${noTiket}`,
      limit: '1',
    });
    const [t] = await this.json<BarisTiket[]>(`tiket?${p}`);
    if (!t?.percakapan) return null;
    const id = t.percakapan.penelepon_id;
    const pel = id ? (await this.penelepon([id])).get(id) : undefined;
    return {
      noTiket: t.no_tiket,
      jenis: t.jenis,
      status: t.status,
      ringkasan: t.ringkasan,
      tglTerbit: t.tgl_terbit,
      percakapanId: t.percakapan_id,
      waktuMulai: t.percakapan.waktu_mulai,
      jenisInteraksi: t.percakapan.jenis_interaksi,
      topik: t.percakapan.topik,
      namaPelapor: pel?.nama_pelapor ?? null,
      noTelp: pel?.no_telp ?? null,
    };
  }
}
