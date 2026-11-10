// Control UC-08 Merekap dan Mengunduh Laporan Layanan (REQ-8.1, REQ-8.2, REQ-8.3, BR-8, NFR-5, NFR-14).
// Mengikuti pola BCE dan nama class diagram SRS (LaporanController).
// Berkas laporan (REQ-8.4, T-F8.2-01) disusun unduhLaporan untuk endpoint GET /api/laporan, setelah hak ekspor diperiksa.
import { FORMAT_BERKAS, susunBerkas, type BerkasLaporan, type FormatBerkas } from './berkasLaporan.ts';

export type JumlahRekap = { panggilan: number; tereskalasi: number; pengaduanSelesai: number };

/** Satu baris rincian per minggu; awal dan akhir berupa tanggal YYYY-MM-DD. */
export type RekapMingguan = JumlahRekap & { awal: string; akhir: string };

export type HasilRekap = { total: JumlahRekap; perMinggu: RekapMingguan[] };

/** Rentang tanggal kalender YYYY-MM-DD (kedua ujung batas inklusif). */
export type Periode = { awal: string; akhir: string };

/** Kamus pesan PRD-rinci Lampiran A (UC-08). */
export const PESAN_LAPORAN = {
  periodeKosong: 'Data tidak tersedia pada periode tersebut.',
  unduhSukses: 'Laporan berhasil diunduh.',
  tanpaHakEkspor: 'Anda tidak memiliki hak akses ekspor data.',
} as const;

/** Interface adapter penyimpanan laporan layanan (PROJECT_RULES 4.3). */
export interface PenyimpananLaporan {
  rekapLayanan(periode: Periode): Promise<HasilRekap>;
  bolehEkspor(): Promise<boolean>;
}

// Kamus belum punya pesan UC-08 untuk permintaan tidak sah dan galat sistem; dipakai pesan API yang sama dengan endpoint
// dashboard lain. Halaman hanya mengirim periode dari daftarPeriode, jadi pesan ini tidak muncul di jalur biasa.
const PESAN_TIDAK_SAH = 'Permintaan tidak valid.';
const PESAN_SISTEM = 'Terjadi kesalahan pada sistem.';

// Periode unduhan terpanjang satu tahun (validasi input, PROJECT_RULES 5.6). Halaman menawarkan satu bulan kalender.
export const BATAS_HARI_PERIODE = 366;
const HARI_MS = 86_400_000;

/** Tanggal kalender YYYY-MM-DD yang benar-benar ada, misalnya bukan 2026-02-30. */
function tanggalSah(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** Periode dari query string: dua tanggal sah, awal tidak sesudah akhir, paling panjang BATAS_HARI_PERIODE hari. */
export function periodeSah(awal: unknown, akhir: unknown): Periode | null {
  if (!tanggalSah(awal) || !tanggalSah(akhir)) return null;
  const hari = (Date.parse(akhir) - Date.parse(awal)) / HARI_MS + 1;
  return hari >= 1 && hari <= BATAS_HARI_PERIODE ? { awal, akhir } : null;
}

const formatSah = (f: unknown): f is FormatBerkas => FORMAT_BERKAS.includes(f as FormatBerkas);

// Pilihan "Periode" dimulai Januari 2025 (SRS Tabel B.9)
const BULAN_PERTAMA = 2025 * 12;
const dua = (n: number) => String(n).padStart(2, '0');

/** Pilihan "Periode" per bulan kalender WIB, terbaru lebih dulu, label SRS: "01-09-2026 s.d. 30-09-2026". */
export function daftarPeriode(sekarang = new Date()): (Periode & { nilai: string; label: string })[] {
  const [tahun, bulan] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' })
    .format(sekarang)
    .split('-')
    .map(Number);

  const hasil = [];
  for (let i = tahun * 12 + bulan - 1; i >= BULAN_PERTAMA; i--) {
    const t = Math.floor(i / 12);
    const b = dua((i % 12) + 1);
    const hariAkhir = dua(new Date(Date.UTC(t, (i % 12) + 1, 0)).getUTCDate());
    hasil.push({
      nilai: `${t}-${b}`,
      label: `01-${b}-${t} s.d. ${hariAkhir}-${b}-${t}`,
      awal: `${t}-${b}-01`,
      akhir: `${t}-${b}-${hariAkhir}`,
    });
  }
  return hasil;
}

/** Implementasi tiruan (Mock) untuk pengujian dan fallback lokal tanpa basis data. */
export class PenyimpananLaporanMock implements PenyimpananLaporan {
  hakEkspor: boolean;
  dataRekap?: HasilRekap;

  constructor(opsi: { hakEkspor?: boolean; dataRekap?: HasilRekap } = {}) {
    this.hakEkspor = opsi.hakEkspor ?? true;
    this.dataRekap = opsi.dataRekap;
  }

  async rekapLayanan({ awal, akhir }: Periode): Promise<HasilRekap> {
    if (this.dataRekap) return this.dataRekap;

    // Default: periode Januari 2025 kosong, periode September 2026 memiliki data contoh
    if (awal.startsWith('2025-01')) {
      return {
        total: { panggilan: 0, tereskalasi: 0, pengaduanSelesai: 0 },
        perMinggu: [{ awal: '2025-01-01', akhir: '2025-01-07', panggilan: 0, tereskalasi: 0, pengaduanSelesai: 0 }],
      };
    }

    return {
      total: { panggilan: 2148, tereskalasi: 163, pengaduanSelesai: 97 },
      perMinggu: [
        { awal: '2026-09-01', akhir: '2026-09-07', panggilan: 512, tereskalasi: 39, pengaduanSelesai: 22 },
        { awal: '2026-09-08', akhir: '2026-09-14', panggilan: 498, tereskalasi: 36, pengaduanSelesai: 24 },
        { awal: '2026-09-15', akhir: '2026-09-21', panggilan: 540, tereskalasi: 41, pengaduanSelesai: 26 },
        { awal: '2026-09-22', akhir: '2026-09-28', panggilan: 480, tereskalasi: 35, pengaduanSelesai: 20 },
        { awal: '2026-09-29', akhir: '2026-09-30', panggilan: 118, tereskalasi: 12, pengaduanSelesai: 5 },
      ],
    };
  }

  async bolehEkspor(): Promise<boolean> {
    return this.hakEkspor;
  }
}

type JumlahRpc = { panggilan: number; tereskalasi: number; pengaduan_selesai: number };
type HasilRpc = { total: JumlahRpc; per_minggu: (JumlahRpc & { awal: string; akhir: string })[] | null };

const dariRpc = (j: JumlahRpc): JumlahRekap => ({
  panggilan: j.panggilan,
  tereskalasi: j.tereskalasi,
  pengaduanSelesai: j.pengaduan_selesai,
});

/** Adapter Supabase untuk memanggil RPC rekap_layanan dan boleh_ekspor. */
export class PenyimpananLaporanSupabase implements PenyimpananLaporan {
  klien: {
    rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };

  constructor(klienSupabase: unknown) {
    this.klien = klienSupabase as typeof this.klien;
  }

  async rekapLayanan({ awal, akhir }: Periode): Promise<HasilRekap> {
    const res = await this.klien.rpc('rekap_layanan', {
      p_awal: awal,
      p_akhir: akhir,
    });
    if (res.error) throw res.error;
    const r = res.data as HasilRpc;
    return {
      total: dariRpc(r.total),
      perMinggu: (r.per_minggu ?? []).map((m) => ({
        awal: m.awal,
        akhir: m.akhir,
        ...dariRpc(m),
      })),
    };
  }

  async bolehEkspor(): Promise<boolean> {
    const res = await this.klien.rpc('boleh_ekspor', {});
    if (res.error) return false;
    return res.data === true;
  }
}

/** Controller UC-08 Merekap dan Mengunduh Laporan Layanan. */
export class LaporanController {
  penyimpanan: PenyimpananLaporan;

  constructor(penyimpanan: PenyimpananLaporan) {
    this.penyimpanan = penyimpanan;
  }

  /** REQ-8.1, REQ-8.2: Periode tanpa data mengembalikan pesan kamus. */
  async hitungRekap(periode: Periode): Promise<HasilRekap | { kosong: string }> {
    const rekap = await this.penyimpanan.rekapLayanan(periode);
    const { panggilan, tereskalasi, pengaduanSelesai } = rekap.total;
    if (panggilan + tereskalasi + pengaduanSelesai === 0) {
      return { kosong: PESAN_LAPORAN.periodeKosong };
    }
    return rekap;
  }

  /** REQ-8.3, BR-8, NFR-14: Periksa hak ekspor petugas. */
  async periksaHakEkspor(): Promise<{ boleh: true } | { boleh: false; pesan: string }> {
    const boleh = await this.penyimpanan.bolehEkspor().catch(() => false);
    return boleh ? { boleh: true } : { boleh: false, pesan: PESAN_LAPORAN.tanpaHakEkspor };
  }

  /**
   * REQ-8.4, BR-8, NFR-14: berkas laporan untuk periode dan format pilihan. Hak ekspor diperiksa lebih dulu, sebelum
   * isian dibaca, sehingga petugas tanpa hak selalu mendapat 403. `kode` adalah kode HTTP (PROJECT_RULES 4.4).
   */
  async unduhLaporan(awal: unknown, akhir: unknown, format: unknown): Promise<{ kode: 200; berkas: BerkasLaporan } | { kode: 403 | 404 | 422 | 500; pesan: string }> {
    const hak = await this.periksaHakEkspor();
    if (!hak.boleh) return { kode: 403, pesan: hak.pesan };
    const periode = periodeSah(awal, akhir);
    if (!periode || !formatSah(format)) return { kode: 422, pesan: PESAN_TIDAK_SAH };
    let hasil: Awaited<ReturnType<LaporanController['hitungRekap']>>;
    try {
      hasil = await this.hitungRekap(periode);
    } catch (e) {
      // PROJECT_RULES 5.10: hanya jenis galat, tanpa isi atau stack.
      console.error('laporan', e instanceof Error ? e.name : 'unknown');
      return { kode: 500, pesan: PESAN_SISTEM };
    }
    // REQ-8.2: periode tanpa data tidak menghasilkan berkas kosong.
    if ('kosong' in hasil) return { kode: 404, pesan: hasil.kosong };
    return { kode: 200, berkas: susunBerkas(periode, hasil, format) };
  }
}
