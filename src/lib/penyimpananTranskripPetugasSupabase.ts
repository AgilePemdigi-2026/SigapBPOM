// Adapter produksi PenyimpananTranskripPetugas: membaca view riwayat_percakapan dan ucapan_petugas (T-F6.1-01) dan memanggil
// RPC catatan pemeriksaan (T-F6.2-01) lewat REST dengan token sesi petugas, sehingga filter is_petugas() di view dan RPC
// berlaku. Nama dan nomor telepon sudah disamarkan view; kolom mentah tidak pernah diminta (NFR-13). Dipakai halaman
// Detail Transkrip (T-F6.2-02).
import {
  PESAN_CATATAN_TERSIMPAN,
  PESAN_CATATAN_WAJIB_DIISI,
  type BarisRiwayatPercakapan,
  type CatatanPemeriksaan,
  type FilterRiwayat,
  type PenyimpananTranskripPetugas,
  type RingkasanPeriodePercakapan,
  type UcapanTranskrip,
} from './TranskripController.ts';

type BarisRiwayat = {
  id: string;
  percakapan_id: string;
  waktu_mulai: string;
  waktu_selesai: string | null;
  jenis_interaksi: BarisRiwayatPercakapan['jenisInteraksi'];
  ringkasan: string | null;
  status_penyelesaian: string;
  no_tiket: string | null;
  no_telp: string | null;
  no_telp_tersamar: string | null;
  nama_pelapor_tersamar: string | null;
};

type BarisUcapan = { id: number; percakapan_id: string; urutan: number; pembicara: UcapanTranskrip['pembicara']; teks: string; detik_ke: number };

type BarisCatatan = { id: string; percakapan_id: string; petugas_id: string; petugas_nama: string | null; isi: string; waktu: string };

const KOLOM_RIWAYAT = 'id,percakapan_id,waktu_mulai,waktu_selesai,jenis_interaksi,ringkasan,status_penyelesaian,no_tiket,no_telp,no_telp_tersamar,nama_pelapor_tersamar';
const KOLOM_UCAPAN = 'id,percakapan_id,urutan,pembicara,teks,detik_ke';

// simpan_catatan_pemeriksaan menolak catatan kosong dengan kode ini dan pesan kamus REQ-5.4.
const KODE_CATATAN_DITOLAK = '22023';

const keRiwayat = (b: BarisRiwayat): BarisRiwayatPercakapan => ({
  id: b.id,
  percakapanId: b.percakapan_id,
  waktuMulai: b.waktu_mulai,
  waktuSelesai: b.waktu_selesai,
  jenisInteraksi: b.jenis_interaksi,
  ringkasan: b.ringkasan,
  statusPenyelesaian: b.status_penyelesaian,
  noTiket: b.no_tiket,
  noTelp: b.no_telp,
  noTelpTersamar: b.no_telp_tersamar,
  namaPelaporTersamar: b.nama_pelapor_tersamar,
});

export class PenyimpananTranskripPetugasSupabase implements PenyimpananTranskripPetugas {
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

  async ambilRiwayat(filter: FilterRiwayat = {}): Promise<BarisRiwayatPercakapan[]> {
    const p = new URLSearchParams({ select: KOLOM_RIWAYAT, order: 'waktu_mulai.desc' });
    if (filter.jenis) p.set('jenis_interaksi', `eq.${filter.jenis}`);
    if (filter.awal) p.append('waktu_mulai', `gte.${filter.awal}`);
    if (filter.akhir) p.append('waktu_mulai', `lte.${filter.akhir}`);
    return (await this.json<BarisRiwayat[]>(`riwayat_percakapan?${p}`)).map(keRiwayat);
  }

  async ambilRingkasanPeriode(filter: { awal?: string; akhir?: string } = {}): Promise<RingkasanPeriodePercakapan> {
    const d = await this.json<Record<string, number> | null>('rpc/ambil_ringkasan_periode_percakapan', { p_awal: filter.awal ?? null, p_akhir: filter.akhir ?? null });
    return {
      totalPercakapan: Number(d?.total_percakapan ?? 0),
      informasiProduk: Number(d?.informasi_produk ?? 0),
      pengaduanProduk: Number(d?.pengaduan_produk ?? 0),
      dieskalasi: Number(d?.dieskalasi ?? 0),
    };
  }

  async ambilDetail(percakapanId: string): Promise<BarisRiwayatPercakapan | null> {
    const p = new URLSearchParams({ select: KOLOM_RIWAYAT, id: `eq.${percakapanId}`, limit: '1' });
    const [baris] = await this.json<BarisRiwayat[]>(`riwayat_percakapan?${p}`);
    return baris ? keRiwayat(baris) : null;
  }

  async ambilTranskrip(percakapanId: string): Promise<UcapanTranskrip[]> {
    const p = new URLSearchParams({ select: KOLOM_UCAPAN, percakapan_id: `eq.${percakapanId}`, order: 'urutan.asc' });
    return (await this.json<BarisUcapan[]>(`ucapan_petugas?${p}`)).map((b) => ({
      id: b.id,
      percakapanId: b.percakapan_id,
      urutan: b.urutan,
      pembicara: b.pembicara,
      teks: b.teks,
      detikKe: b.detik_ke,
    }));
  }

  async ambilCatatan(percakapanId: string): Promise<CatatanPemeriksaan[]> {
    const baris = await this.json<BarisCatatan[] | null>('rpc/ambil_catatan_pemeriksaan', { p_percakapan_id: percakapanId });
    return (baris ?? []).map((b) => ({ id: b.id, percakapanId: b.percakapan_id, petugasId: b.petugas_id, petugasNama: b.petugas_nama, isi: b.isi, waktu: b.waktu }));
  }

  async simpanCatatan(percakapanId: string, catatan: string): Promise<{ id: string; pesan: string }> {
    const res = await this.minta('rpc/simpan_catatan_pemeriksaan', { p_percakapan_id: percakapanId, p_catatan: catatan });
    if (!res.ok) {
      const galat = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
      if (galat?.code === KODE_CATATAN_DITOLAK && galat.message === PESAN_CATATAN_WAJIB_DIISI) throw new Error(PESAN_CATATAN_WAJIB_DIISI);
      throw new Error(`Supabase ${res.status} pada rpc/simpan_catatan_pemeriksaan`);
    }
    return { id: String(await res.json()), pesan: PESAN_CATATAN_TERSIMPAN };
  }
}
