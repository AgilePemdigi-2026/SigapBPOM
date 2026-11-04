// Control UC-05 Membaca Transkrip Percakapan di dashboard: daftar percakapan dan ringkasan periode (REQ-5.1, T-F6.1-02).
// ambilTranskrip dan simpanCatatan dari class diagram (REQ-5.2 sampai REQ-5.4) dibuat di task-nya sendiri. Pencatatan
// transkrip oleh Voice Gateway (UC-01) ada di supabase/functions/_shared/control/TranskripController.ts.
import { LABEL_JENIS_INTERAKSI } from './PemantauanLayananController.ts';

/** Status percakapan yang sudah berakhir. Percakapan berstatus berjalan bukan bagian riwayat. */
export type StatusPenyelesaian = 'selesai_ai' | 'dieskalasi' | 'tiket_terbit' | 'pengaduan_tidak_lengkap' | 'terputus';

/** Baris view riwayat_percakapan (T-F6.1-01) yang tampil di Daftar Percakapan. */
export type PercakapanTersimpan = {
  id: string;
  waktuMulai: string;
  jenisInteraksi: string | null;
  ringkasan: string | null;
  statusPenyelesaian: string;
};

/** Rentang waktu_mulai [dari, sampai) dalam ISO 8601. */
export type Periode = { dari: string; sampai: string };

export type RingkasanPeriode = { total: number; informasiProduk: number; pengaduanProduk: number; dieskalasi: number };

/** Penyimpanan riwayat percakapan (PROJECT_RULES 4.3): view Supabase atau implementasi tiruan. */
export interface PenyimpananRiwayat {
  /** Satu halaman percakapan dalam periode, terbaru lebih dulu; `jenis` menyaring jenis_interaksi bila diisi. */
  daftar(kueri: { periode: Periode; jenis?: string; offset: number; batas: number }): Promise<PercakapanTersimpan[]>;
  ringkasan(periode: Periode): Promise<RingkasanPeriode>;
}

/** Label baku status_penyelesaian (PRD-rinci Bagian 9, SRS 3.1.7). */
export const LABEL_STATUS_PENYELESAIAN: Record<StatusPenyelesaian, string> = {
  selesai_ai: 'selesai oleh AI',
  dieskalasi: 'dieskalasi',
  tiket_terbit: 'tiket terbit',
  pengaduan_tidak_lengkap: 'pengaduan tidak lengkap',
  terputus: 'terputus',
};

/** Kamus pesan PRD-rinci Lampiran A. UC-05 belum punya pesan untuk daftar, jadi dipakai pesan terdekat (UC-04, UC-08). */
export const PESAN_RIWAYAT = {
  gagalDimuat: 'Data panggilan gagal dimuat.',
  kosong: 'Data tidak tersedia pada periode tersebut.',
} as const;

// REQ-5.1: jumlah baris Daftar Percakapan per halaman, sesuai mockup Figma 09 · Riwayat Percakapan.
export const UKURAN_HALAMAN = 8;
// Pilihan periode: bulan berjalan dan sebelas bulan sebelumnya.
export const JUMLAH_BULAN_PILIHAN = 12;
const ZONA = 'Asia/Jakarta';

export type BarisPercakapan = {
  waktu: string;
  jenis: string;
  ringkasan: string;
  labelStatus: string;
  tautanTranskrip: string;
};

/** Satu pilihan periode per bulan kalender WIB; `nilai` berbentuk YYYY-MM. */
export type PilihanPeriode = { nilai: string; label: string; labelPendek: string; periode: Periode };

export type DaftarPercakapan = {
  periode: PilihanPeriode;
  pilihanPeriode: PilihanPeriode[];
  /** jenis_interaksi yang disaring, atau '' untuk semua jenis. */
  jenis: string;
  ringkasan: RingkasanPeriode;
  percakapan: BarisPercakapan[];
  halaman: number;
  jumlahHalaman: number;
  /** Jumlah percakapan yang cocok dengan saringan jenis. */
  jumlah: number;
  /** Nomor urut baris pertama dan terakhir halaman ini; 0 bila kosong. */
  awal: number;
  akhir: number;
};

const label = (kamus: Record<string, string>, kunci: string | null) => (kunci && Object.hasOwn(kamus, kunci) ? kamus[kunci] : undefined);

const bagian = (d: Date, opsi: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat('id-ID', { timeZone: ZONA, ...opsi }).formatToParts(d).map((p) => [p.type, p.value]));

const waktuTampil = (iso: string) => {
  const b = bagian(new Date(iso), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${b.day} ${b.month} · ${b.hour}:${b.minute}`;
};

const awalBulan = (tahun: number, bulan: number) => new Date(`${tahun}-${String(bulan).padStart(2, '0')}-01T00:00:00+07:00`);

/** Periode per bulan WIB, terbaru lebih dulu. Bulan berjalan berakhir di `sekarang`; bulan lalu penuh sampai awal bulan berikutnya. */
export function daftarPeriode(sekarang: Date): PilihanPeriode[] {
  const [tahun, bulan] = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(sekarang).split('-').map(Number);
  return Array.from({ length: JUMLAH_BULAN_PILIHAN }, (_, i) => {
    const t = tahun + Math.floor((bulan - 1 - i) / 12);
    const b = ((((bulan - 1 - i) % 12) + 12) % 12) + 1;
    const dari = awalBulan(t, b);
    const sampai = i === 0 ? sekarang : awalBulan(b === 12 ? t + 1 : t, (b % 12) + 1);
    const hariAkhir = bagian(new Date(sampai.getTime() - (i === 0 ? 0 : 1)), { day: 'numeric' }).day;
    const nama = (month: 'long' | 'short') => bagian(dari, { month }).month;
    return {
      nilai: `${t}-${String(b).padStart(2, '0')}`,
      label: `1–${hariAkhir} ${nama('long')} ${t}`,
      labelPendek: `1–${hariAkhir} ${nama('short')} ${t}`,
      periode: { dari: dari.toISOString(), sampai: sampai.toISOString() },
    };
  });
}

/** Nomor halaman yang ditampilkan: pertama, terakhir, dan tetangga halaman aktif; null menandai celah. */
export function nomorHalaman(halaman: number, jumlah: number): (number | null)[] {
  const n = [...new Set([1, halaman - 1, halaman, halaman + 1, jumlah])].filter((x) => x >= 1 && x <= jumlah).sort((a, b) => a - b);
  return n.flatMap((x, i) => (i && x - n[i - 1] > 1 ? [null, x] : [x]));
}

/**
 * Control class TranskripController sesuai Class Diagram SRS (Lampiran B.2).
 */
export class TranskripController {
  penyimpanan: PenyimpananRiwayat;

  constructor(penyimpanan: PenyimpananRiwayat) {
    this.penyimpanan = penyimpanan;
  }

  /**
   * REQ-5.1: daftar percakapan dengan waktu, jenis, ringkasan, dan status penyelesaian, plus ringkasan periode.
   * Periode (YYYY-MM) dan jenis dari query string; nilai yang tidak dikenal kembali ke bulan berjalan dan semua jenis.
   */
  async ambilDaftarPercakapan(
    kueri: { halaman?: unknown; periode?: unknown; jenis?: unknown } = {},
    sekarang = new Date(),
  ): Promise<DaftarPercakapan | { gagal: string }> {
    const pilihanPeriode = daftarPeriode(sekarang);
    const periode = pilihanPeriode.find((p) => p.nilai === kueri.periode) ?? pilihanPeriode[0];
    const jenis = typeof kueri.jenis === 'string' && Object.hasOwn(LABEL_JENIS_INTERAKSI, kueri.jenis) ? kueri.jenis : '';
    try {
      const ringkasan = await this.penyimpanan.ringkasan(periode.periode);
      const jumlah = jenis === 'informasi_produk' ? ringkasan.informasiProduk : jenis === 'pengaduan' ? ringkasan.pengaduanProduk : ringkasan.total;
      const jumlahHalaman = Math.max(1, Math.ceil(jumlah / UKURAN_HALAMAN));
      // Nomor halaman yang tidak sah atau di luar jangkauan dibawa ke halaman terdekat.
      const halaman = Math.min(jumlahHalaman, Math.max(1, Math.trunc(Number(kueri.halaman)) || 1));
      const offset = (halaman - 1) * UKURAN_HALAMAN;
      const baris = await this.penyimpanan.daftar({ periode: periode.periode, jenis: jenis || undefined, offset, batas: UKURAN_HALAMAN });
      return {
        periode,
        pilihanPeriode,
        jenis,
        ringkasan,
        percakapan: baris.map((p) => ({
          waktu: waktuTampil(p.waktuMulai),
          jenis: label(LABEL_JENIS_INTERAKSI, p.jenisInteraksi) ?? '—',
          ringkasan: p.ringkasan?.trim() || '—',
          labelStatus: label(LABEL_STATUS_PENYELESAIAN, p.statusPenyelesaian) ?? p.statusPenyelesaian,
          tautanTranskrip: `/riwayat-percakapan/detail?id=${encodeURIComponent(p.id)}`,
        })),
        halaman,
        jumlahHalaman,
        jumlah,
        awal: baris.length ? offset + 1 : 0,
        akhir: offset + baris.length,
      };
    } catch {
      return { gagal: PESAN_RIWAYAT.gagalDimuat };
    }
  }
}
