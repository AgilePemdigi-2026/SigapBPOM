// Control UC-08 Merekap dan Mengunduh Laporan Layanan: rekap per periode (REQ-8.1, REQ-8.2) dan hak ekspor (REQ-8.3,
// BR-8, NFR-14). Angka rekap dihitung RPC rekap_layanan (T-F8.1-01) di basis data, tidak di sini dan tidak di browser.
// Berkas laporan (REQ-8.4, T-F8.2-01) disusun unduhLaporan untuk endpoint GET /api/laporan, setelah hak ekspor diperiksa.
import { FORMAT_BERKAS, susunBerkas, type BerkasLaporan, type FormatBerkas } from './berkasLaporan.ts';

export type JumlahRekap = { panggilan: number; tereskalasi: number; pengaduanSelesai: number };
/** Satu baris rincian per minggu; awal dan akhir berupa tanggal WIB YYYY-MM-DD dari RPC. */
export type RekapMingguan = JumlahRekap & { awal: string; akhir: string };
export type HasilRekap = { total: JumlahRekap; perMinggu: RekapMingguan[] };
/** Rentang tanggal WIB YYYY-MM-DD, kedua ujung ikut dihitung. */
export type Periode = { awal: string; akhir: string };

/** Penyimpanan laporan (PROJECT_RULES 4.3): RPC Supabase dengan token petugas, atau tiruan. */
export interface PenyimpananLaporan {
  rekapLayanan(periode: Periode): Promise<HasilRekap>;
  /** Hak ekspor petugas yang sedang masuk; identitasnya dibawa token sesi. */
  bolehEkspor(): Promise<boolean>;
}

/** Kamus pesan PRD-rinci Lampiran A, UC-08. */
export const PESAN_LAPORAN = {
  periodeKosong: 'Data tidak tersedia pada periode tersebut.',
  unduhSukses: 'Laporan berhasil diunduh.',
  tanpaHakEkspor: 'Anda tidak memiliki hak akses ekspor data.',
} as const;

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

// Pilihan "Periode" dimulai Januari 2025 agar contoh periode kosong SRS Tabel B.9 (01-01-2025 s.d. 31-01-2025) bisa dipilih.
const BULAN_PERTAMA = 2025 * 12;

const dua = (n: number) => String(n).padStart(2, '0');

/** Pilihan "Periode" per bulan kalender WIB, terbaru lebih dulu, berlabel seperti SRS: "01-09-2026 s.d. 30-09-2026". */
export function daftarPeriode(sekarang = new Date()): (Periode & { nilai: string; label: string })[] {
  const [tahun, bulan] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(sekarang).split('-').map(Number);
  const hasil = [];
  for (let i = tahun * 12 + bulan - 1; i >= BULAN_PERTAMA; i--) {
    const [t, b] = [Math.floor(i / 12), dua((i % 12) + 1)];
    const hariAkhir = dua(new Date(Date.UTC(t, (i % 12) + 1, 0)).getUTCDate());
    hasil.push({ nilai: `${t}-${b}`, label: `01-${b}-${t} s.d. ${hariAkhir}-${b}-${t}`, awal: `${t}-${b}-01`, akhir: `${t}-${b}-${hariAkhir}` });
  }
  return hasil;
}

export class LaporanController {
  penyimpanan: PenyimpananLaporan;

  constructor(penyimpanan: PenyimpananLaporan) {
    this.penyimpanan = penyimpanan;
  }

  /** REQ-8.1, REQ-8.2: rekap diteruskan apa adanya dari RPC; periode tanpa satu pun angka memberi pesan kamus. */
  async hitungRekap(periode: Periode): Promise<HasilRekap | { kosong: string }> {
    const rekap = await this.penyimpanan.rekapLayanan(periode);
    const { panggilan, tereskalasi, pengaduanSelesai } = rekap.total;
    return panggilan + tereskalasi + pengaduanSelesai === 0 ? { kosong: PESAN_LAPORAN.periodeKosong } : rekap;
  }

  /** REQ-8.3, BR-8, NFR-14. SRS menulis periksaHakEkspor(idPetugas); di sini idPetugas dibawa token sesi. Gagal memeriksa berarti tidak berhak. */
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
