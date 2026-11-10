// Penyusun halaman Riwayat Percakapan UC-05 (T-F6.1-02, REQ-5.1, SRS 3.1.7). Membaca daftar dan ringkasan periode lewat
// TranskripController (T-F6.1-01): daftar dari view riwayat_percakapan dengan paginasi, kartu dan jumlah halaman dari
// RPC ambil_ringkasan_periode_percakapan, keduanya dengan token petugas. Pemilihan penyimpanan (tiruan hanya tanpa token
// di pengembangan lokal) memakai transkripPetugas dari halaman Detail Transkrip.
import { LABEL_JENIS_INTERAKSI } from './PemantauanLayananController.ts';
import { LABEL_STATUS_PENYELESAIAN } from './detailTranskrip.ts';
import type { FilterRiwayat, RingkasanPeriodePercakapan, TranskripController } from './TranskripController.ts';

/** Kamus pesan PRD-rinci Lampiran A. UC-05 belum punya pesan gagal dimuat, jadi dipakai pesan UC-04. */
export const PESAN_RIWAYAT = {
  gagalDimuat: 'Data panggilan gagal dimuat.',
  kosong: 'Data tidak tersedia pada periode tersebut.',
} as const;

// REQ-5.1: jumlah baris Daftar Percakapan per halaman, sesuai mockup Figma 09 · Riwayat Percakapan.
export const UKURAN_HALAMAN = 8;
// Pilihan periode: bulan berjalan dan sebelas bulan sebelumnya.
export const JUMLAH_BULAN_PILIHAN = 12;
const ZONA = 'Asia/Jakarta';

/** Rentang waktu_mulai [awal, akhir] dalam ISO 8601, inklusif seperti RPC dan view. */
export type Periode = { awal: string; akhir: string };

/** Satu pilihan periode per bulan kalender WIB; `nilai` berbentuk YYYY-MM. */
export type PilihanPeriode = { nilai: string; label: string; labelPendek: string; periode: Periode };

export type BarisPercakapan = { waktu: string; jenis: string; ringkasan: string; labelStatus: string; tautanTranskrip: string };

export type DaftarPercakapan = {
  periode: PilihanPeriode;
  pilihanPeriode: PilihanPeriode[];
  /** jenis_interaksi yang disaring, atau '' untuk semua jenis. */
  jenis: string;
  ringkasan: RingkasanPeriodePercakapan;
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

/** Periode per bulan WIB, terbaru lebih dulu. Bulan berjalan berakhir di `sekarang`; bulan lalu berakhir 1 ms sebelum bulan berikutnya. */
export function daftarPeriode(sekarang: Date): PilihanPeriode[] {
  const [tahun, bulan] = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(sekarang).split('-').map(Number);
  return Array.from({ length: JUMLAH_BULAN_PILIHAN }, (_, i) => {
    const t = tahun + Math.floor((bulan - 1 - i) / 12);
    const b = ((((bulan - 1 - i) % 12) + 12) % 12) + 1;
    const awal = awalBulan(t, b);
    const akhir = i === 0 ? sekarang : new Date(awalBulan(b === 12 ? t + 1 : t, (b % 12) + 1).getTime() - 1);
    const nama = (month: 'long' | 'short') => bagian(awal, { month }).month;
    const hariAkhir = bagian(akhir, { day: 'numeric' }).day;
    return {
      nilai: `${t}-${String(b).padStart(2, '0')}`,
      label: `1–${hariAkhir} ${nama('long')} ${t}`,
      labelPendek: `1–${hariAkhir} ${nama('short')} ${t}`,
      periode: { awal: awal.toISOString(), akhir: akhir.toISOString() },
    };
  });
}

/** Nomor halaman yang ditampilkan: pertama, terakhir, dan tetangga halaman aktif; null menandai celah. */
export function nomorHalaman(halaman: number, jumlah: number): (number | null)[] {
  const n = [...new Set([1, halaman - 1, halaman, halaman + 1, jumlah])].filter((x) => x >= 1 && x <= jumlah).sort((a, b) => a - b);
  return n.flatMap((x, i) => (i && x - n[i - 1] > 1 ? [null, x] : [x]));
}

/**
 * REQ-5.1: daftar percakapan dengan waktu, jenis, ringkasan, dan status penyelesaian, plus ringkasan periode.
 * Periode (YYYY-MM) dan jenis dari query string; nilai yang tidak dikenal kembali ke bulan berjalan dan semua jenis.
 */
export async function ambilDaftarPercakapan(
  transkrip: TranskripController,
  kueri: { halaman?: unknown; periode?: unknown; jenis?: unknown } = {},
  sekarang = new Date(),
): Promise<DaftarPercakapan | { gagal: string }> {
  const pilihanPeriode = daftarPeriode(sekarang);
  const periode = pilihanPeriode.find((p) => p.nilai === kueri.periode) ?? pilihanPeriode[0];
  const jenis = typeof kueri.jenis === 'string' && Object.hasOwn(LABEL_JENIS_INTERAKSI, kueri.jenis) ? (kueri.jenis as NonNullable<FilterRiwayat['jenis']>) : undefined;
  try {
    const ringkasan = await transkrip.ambilRingkasanPeriode(periode.periode);
    const jumlah = jenis === 'informasi_produk' ? ringkasan.informasiProduk : jenis === 'pengaduan' ? ringkasan.pengaduanProduk : ringkasan.totalPercakapan;
    const jumlahHalaman = Math.max(1, Math.ceil(jumlah / UKURAN_HALAMAN));
    // Nomor halaman yang tidak sah atau di luar jangkauan dibawa ke halaman terdekat.
    const halaman = Math.min(jumlahHalaman, Math.max(1, Math.trunc(Number(kueri.halaman)) || 1));
    const offset = (halaman - 1) * UKURAN_HALAMAN;
    const baris = await transkrip.ambilRiwayat({ ...periode.periode, jenis, offset, batas: UKURAN_HALAMAN });
    return {
      periode,
      pilihanPeriode,
      jenis: jenis ?? '',
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
