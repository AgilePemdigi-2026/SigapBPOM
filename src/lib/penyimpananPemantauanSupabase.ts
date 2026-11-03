// Adapter produksi PenyimpananPemantauan: membaca Supabase lewat REST dengan token sesi petugas, sehingga RLS dan
// pemeriksaan is_petugas() berlaku (T-F5.1-02, T-F5.2-01, T-F5.3-02, T-F5.3-03, T-F5.4-01). Ringkasan dan detail kasus
// memakai RPC dari T-F5.1-01 dan T-F5.3-01, antrean memakai view antrean_tiket_petugas; struktur view-nya tidak diubah
// di sini. Token sesi datang dari T-F3.1-03.
import type {
  DataRingkasanLayanan,
  DetailKasusPengaduan,
  KasusPerluTindakLanjut,
  LogToolTersimpan,
  PanggilanAktif,
  PenyimpananPemantauan,
  TiketAntrean,
} from './PemantauanLayananController.ts';

type BarisKasus = { id: string; no_tiket: string; jenis: KasusPerluTindakLanjut['jenis']; ringkasan: string | null; status: string; tgl_terbit: string; percakapan_id: string | null };

type HasilRingkasan = {
  statistik: { panggilan_hari_ini: number; jawaban_otomatis_ai: number; tiket_eskalasi_baru: number; pengaduan_selesai: number; panggilan_berjalan: number };
  kategori: { kategori: string; jumlah: number; persentase: number }[];
  kasus_perlu_tindak_lanjut: BarisKasus[];
};

type HasilDetail = {
  tiket_id: string;
  no_tiket: string;
  jenis_tiket: KasusPerluTindakLanjut['jenis'];
  status_tiket: string;
  ringkasan: string | null;
  tgl_terbit: string;
  percakapan_id: string;
  pengaduan_id: string | null;
  nama_produk: string | null;
  nama_produk_diadukan: string | null;
  kronologi: string | null;
  kelengkapan: boolean | null;
  tgl_pengaduan: string | null;
  nama_pelapor_tersamar: string | null;
  no_telp_tersamar: string | null;
};

// Kode galat yang dilempar ambil_detail_pengaduan_tiket bila tiket tidak ada.
const KODE_TIKET_TIDAK_ADA = 'P0002';

const opsional = <T>(v: T | null) => v ?? undefined;

export class PenyimpananPemantauanSupabase implements PenyimpananPemantauan {
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

  async minta(path: string, body?: unknown) {
    return this.fetch(`${this.url}/rest/v1/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { apikey: this.kunciPublik, Authorization: `Bearer ${this.tokenAkses}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async json<T>(path: string, body?: unknown) {
    const res = await this.minta(path, body);
    if (!res.ok) throw new Error(`Supabase ${res.status} pada ${path.split('?')[0]}`);
    return (await res.json()) as T;
  }

  async ambilRingkasan(): Promise<DataRingkasanLayanan> {
    const r = await this.json<HasilRingkasan>('rpc/ambil_ringkasan_layanan', {});
    const s = r.statistik;
    return {
      statistik: {
        panggilanHariIni: s.panggilan_hari_ini,
        jawabanOtomatisAi: s.jawaban_otomatis_ai,
        tiketEskalasiBaru: s.tiket_eskalasi_baru,
        pengaduanSelesai: s.pengaduan_selesai,
        panggilanBerjalan: s.panggilan_berjalan,
      },
      kategori: r.kategori.map((k) => ({ kategori: k.kategori, jumlah: k.jumlah, persentase: Number(k.persentase) })),
      kasusPerluTindakLanjut: r.kasus_perlu_tindak_lanjut.map((k) => ({
        id: k.id,
        noTiket: k.no_tiket,
        jenis: k.jenis,
        ringkasan: k.ringkasan ?? '',
        status: k.status,
        tglTerbit: k.tgl_terbit,
        percakapanId: opsional(k.percakapan_id),
      })),
    };
  }

  /** Nomor tersamar per penelepon; nomor lengkap tidak pernah diminta (PROJECT_RULES 5.5). */
  async noTelpTersamar(ids: string[]) {
    if (!ids.length) return new Map<string, string | null>();
    const p = new URLSearchParams({ select: 'id,no_telp', id: `in.(${ids.join(',')})` });
    const baris = await this.json<{ id: string; no_telp: string | null }[]>(`penelepon_tersamar?${p}`);
    return new Map(baris.map((b) => [b.id, b.no_telp]));
  }

  async ambilPanggilanAktif(): Promise<PanggilanAktif[]> {
    const p = new URLSearchParams({
      select: 'id,penelepon_id,jenis_interaksi,topik,waktu_mulai,tahap_ai',
      status_penyelesaian: 'eq.berjalan',
      order: 'waktu_mulai.asc',
    });
    const baris = await this.json<{ id: string; penelepon_id: string | null; jenis_interaksi: string | null; topik: string | null; waktu_mulai: string; tahap_ai: string | null }[]>(
      `percakapan?${p}`,
    );
    const noTelp = await this.noTelpTersamar([...new Set(baris.flatMap((b) => (b.penelepon_id ? [b.penelepon_id] : [])))]);
    const kini = Date.now();
    return baris.map((b) => ({
      id: b.id,
      noTelp: (b.penelepon_id && noTelp.get(b.penelepon_id)) || null,
      jenisLayanan: b.jenis_interaksi,
      topik: b.topik,
      waktuMulai: b.waktu_mulai,
      durasiDetik: Math.max(0, Math.floor((kini - Date.parse(b.waktu_mulai)) / 1000)),
      tahapAi: b.tahap_ai,
    }));
  }

  async ambilAntreanTiket(): Promise<TiketAntrean[]> {
    // Kolom data pribadi tersamar tidak diminta karena antrean tidak menampilkannya. Urutan akhir ditetapkan control.
    const p = new URLSearchParams({ select: 'tiket_id,no_tiket,jenis_tiket,ringkasan,status_tiket,waktu_masuk,percakapan_id' });
    const baris = await this.json<
      { tiket_id: string; no_tiket: string; jenis_tiket: TiketAntrean['jenis']; ringkasan: string | null; status_tiket: string; waktu_masuk: string; percakapan_id: string | null }[]
    >(`antrean_tiket_petugas?${p}`);
    return baris.map((b) => ({
      id: b.tiket_id,
      noTiket: b.no_tiket,
      jenis: b.jenis_tiket,
      ringkasan: b.ringkasan ?? '',
      status: b.status_tiket,
      waktuMasuk: b.waktu_masuk,
      percakapanId: opsional(b.percakapan_id),
    }));
  }

  async ambilDetailKasus(noTiket: string): Promise<DetailKasusPengaduan | null> {
    const res = await this.minta('rpc/ambil_detail_pengaduan_tiket', { p_no_tiket: noTiket });
    if (!res.ok) {
      const galat = (await res.json().catch(() => null)) as { code?: string } | null;
      if (galat?.code === KODE_TIKET_TIDAK_ADA) return null;
      throw new Error(`Supabase ${res.status} pada rpc/ambil_detail_pengaduan_tiket`);
    }
    const d = (await res.json()) as HasilDetail;
    return {
      tiketId: d.tiket_id,
      noTiket: d.no_tiket,
      jenis: d.jenis_tiket,
      status: d.status_tiket,
      ringkasan: d.ringkasan ?? '',
      tglTerbit: d.tgl_terbit,
      percakapanId: d.percakapan_id,
      pengaduanId: opsional(d.pengaduan_id),
      namaProduk: opsional(d.nama_produk),
      namaProdukDiadukan: opsional(d.nama_produk_diadukan),
      kronologi: opsional(d.kronologi),
      kelengkapan: opsional(d.kelengkapan),
      tglPengaduan: opsional(d.tgl_pengaduan),
      namaPelaporTersamar: opsional(d.nama_pelapor_tersamar),
      noTelpTersamar: opsional(d.no_telp_tersamar),
    };
  }

  async ambilLogTool(batas: number): Promise<LogToolTersimpan[]> {
    const p = new URLSearchParams({ select: 'id,nama_tool,durasi_ms,berhasil,waktu', order: 'waktu.desc,id.desc', limit: String(batas) });
    const baris = await this.json<{ id: number; nama_tool: string; durasi_ms: number; berhasil: boolean; waktu: string }[]>(`log_tool?${p}`);
    return baris.map((b) => ({ id: b.id, namaTool: b.nama_tool, durasiMs: b.durasi_ms, berhasil: b.berhasil, waktu: b.waktu }));
  }
}
