// Penyusun halaman Daftar Pengaduan UC-06 (T-F7.1-02, UC-06 langkah 1 sampai 3, SRS 3.1.9): filter status dengan jumlah
// per tahap, tabel pengaduan bertiket, dan pengaduan tidak lengkap (tanpa tiket) yang ditampilkan terpisah. Daftar
// tidak memuat data pribadi pelapor. Dengan token sesi Supabase, data dibaca memakai token petugas agar is_petugas()
// berlaku; penyimpanan tiruan hanya untuk jalur tanpa token di pengembangan lokal, tidak pernah di build produksi.
import { LABEL_STATUS_TIKET, PESAN_PEMANTAUAN, type StatusTiket } from './PemantauanLayananController.ts';
import { contohPemantauan } from './mock/pemantauanTiruan.ts';
import { PenyimpananDaftarPengaduanSupabase } from './penyimpananDaftarPengaduanSupabase.ts';
import { bacaKonfigurasiSupabase } from './konfigurasiSupabase.ts';

/** Pengaduan bertiket ADU dari view detail_pengaduan_tiket, kategori dari topik percakapan. */
export type PengaduanTersimpan = { noTiket: string; namaProduk: string | null; kategori: string | null; tglPengaduan: string; status: string };

/** Percakapan berstatus pengaduan_tidak_lengkap: tidak punya tiket (REQ-2.5). */
export type PengaduanTidakLengkap = { percakapanId: string; kategori: string | null; waktu: string };

/** Penyimpanan daftar pengaduan (PROJECT_RULES 4.3): view Supabase atau implementasi tiruan. */
export interface PenyimpananDaftarPengaduan {
  daftar(): Promise<PengaduanTersimpan[]>;
  tidakLengkap(): Promise<PengaduanTidakLengkap[]>;
}

export type FilterStatus = { status: StatusTiket | ''; label: string; jumlah: number; aktif: boolean; tautan: string };

export type BarisPengaduan = {
  noTiket: string;
  produk: string;
  kategori: string;
  tanggal: string;
  labelStatus: string;
  /** Tombol "Telaah", hanya untuk pengaduan Belum Ditelaah (UC-06 langkah 3). */
  tautanTelaah: string | null;
  tautanKasus: string;
};

export type BarisTidakLengkap = { waktu: string; kategori: string; tautanTranskrip: string };

export type DaftarPengaduan = { status: StatusTiket | ''; filter: FilterStatus[]; pengaduan: BarisPengaduan[]; tidakLengkap: BarisTidakLengkap[] };

const STATUS_TELAAH: StatusTiket = 'belum_ditelaah';
const ZONA = 'Asia/Jakarta';

const tanggalTampil = (iso: string) => {
  const b = Object.fromEntries(
    new Intl.DateTimeFormat('id-ID', { timeZone: ZONA, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${b.day} ${b.month} ${b.year} · ${b.hour}:${b.minute}`;
};

const terbaru = (a: string, b: string) => Date.parse(b) - Date.parse(a);
const tautanStatus = (status: string) => (status ? `/pengaduan?status=${status}` : '/pengaduan');
const tautanDetail = (noTiket: string) => `/pengaduan/detail?tiket=${encodeURIComponent(noTiket)}`;

/** UC-06 langkah 1 sampai 3: daftar pengaduan dengan filter status. Status di luar daftar baku kembali ke Semua. */
export async function ambilDaftarPengaduan(penyimpanan: PenyimpananDaftarPengaduan, kueri: { status?: unknown }): Promise<DaftarPengaduan | { gagal: string }> {
  const status = typeof kueri.status === 'string' && Object.hasOwn(LABEL_STATUS_TIKET, kueri.status) ? (kueri.status as StatusTiket) : '';
  try {
    const [semua, tidakLengkap] = await Promise.all([penyimpanan.daftar(), penyimpanan.tidakLengkap()]);
    const jumlah = (s: string) => semua.filter((p) => p.status === s).length;
    return {
      status,
      filter: [
        { status: '', label: 'Semua', jumlah: semua.length, aktif: status === '', tautan: tautanStatus('') },
        ...(Object.entries(LABEL_STATUS_TIKET) as [StatusTiket, string][]).map(([s, label]) => ({ status: s, label, jumlah: jumlah(s), aktif: status === s, tautan: tautanStatus(s) })),
      ],
      pengaduan: semua
        .filter((p) => !status || p.status === status)
        .sort((a, b) => terbaru(a.tglPengaduan, b.tglPengaduan))
        .map((p) => ({
          noTiket: p.noTiket,
          produk: p.namaProduk?.trim() || '—',
          kategori: p.kategori?.trim() || '—',
          tanggal: tanggalTampil(p.tglPengaduan),
          labelStatus: Object.hasOwn(LABEL_STATUS_TIKET, p.status) ? LABEL_STATUS_TIKET[p.status as StatusTiket] : p.status,
          tautanTelaah: p.status === STATUS_TELAAH ? tautanDetail(p.noTiket) : null,
          tautanKasus: tautanDetail(p.noTiket),
        })),
      tidakLengkap: [...tidakLengkap]
        .sort((a, b) => terbaru(a.waktu, b.waktu))
        .map((p) => ({ waktu: tanggalTampil(p.waktu), kategori: p.kategori?.trim() || '—', tautanTranskrip: `/riwayat-percakapan/detail?id=${encodeURIComponent(p.percakapanId)}` })),
    };
  } catch {
    return { gagal: PESAN_PEMANTAUAN.detailGagalDimuat };
  }
}

/** Data tiruan dari contoh pemantauan UC-04, agar tombol Telaah membuka Detail Pengaduan tiruan yang sama. */
export class PenyimpananDaftarPengaduanTiruan implements PenyimpananDaftarPengaduan {
  pengaduan: PengaduanTersimpan[];
  tanpaTiket: PengaduanTidakLengkap[];

  constructor(pengaduan?: PengaduanTersimpan[], tanpaTiket?: PengaduanTidakLengkap[], sekarang = new Date()) {
    const contoh = contohPemantauan(sekarang);
    const topik = new Map(contoh.percakapan.map((p) => [p.id, p.topik]));
    this.pengaduan = pengaduan ?? contoh.tiket.flatMap((t) =>
      t.jenis === 'pengaduan' ? [{ noTiket: t.noTiket, namaProduk: t.pengaduan?.namaProduk ?? null, kategori: topik.get(t.percakapanId) ?? null, tglPengaduan: t.pengaduan?.tglPengaduan ?? t.tglTerbit, status: t.status }] : [],
    );
    this.tanpaTiket = tanpaTiket ?? [{ percakapanId: '88888888-0000-0000-0000-000000000004', kategori: 'Obat Tradisional', waktu: new Date(sekarang.getTime() - 75 * 60_000).toISOString() }];
  }

  async daftar() {
    return this.pengaduan;
  }

  async tidakLengkap() {
    return this.tanpaTiket;
  }
}

const tiruan = new PenyimpananDaftarPengaduanTiruan();

export function pilihPenyimpananDaftarPengaduan(
  tokenAkses: string | undefined,
  env: Record<string, string | undefined> = process.env,
  produksi: boolean = import.meta.env.PROD,
): PenyimpananDaftarPengaduan {
  if (!tokenAkses && !produksi) return tiruan;
  const konfigurasi = bacaKonfigurasiSupabase(env);
  return new PenyimpananDaftarPengaduanSupabase({ url: konfigurasi?.url ?? '', kunciPublik: konfigurasi?.kunciAnon ?? '', tokenAkses: tokenAkses ?? '' });
}

export const daftarPengaduan = (tokenAkses: string | undefined, kueri: { status?: unknown }) => ambilDaftarPengaduan(pilihPenyimpananDaftarPengaduan(tokenAkses), kueri);
