// Control UC-05 Membaca Transkrip Percakapan di dashboard: daftar percakapan dan ringkasan periode (REQ-5.1, T-F6.1-02).
// ambilTranskrip dan simpanCatatan dari class diagram (REQ-5.2 sampai REQ-5.4) dibuat di task-nya sendiri. Pencatatan
// transkrip oleh Voice Gateway (UC-01) ada di supabase/functions/_shared/control/TranskripController.ts.
import { LABEL_JENIS_INTERAKSI } from './PemantauanLayananController.ts';

/** Status percakapan yang sudah berakhir. Percakapan berstatus berjalan bukan bagian riwayat. */
export type StatusPenyelesaian = 'selesai_ai' | 'dieskalasi' | 'tiket_terbit' | 'pengaduan_tidak_lengkap';

/** Baris view riwayat_percakapan (T-F6.1-01). noTelpTersamar sudah disamarkan di server (NFR-13). */
export type PercakapanTersimpan = {
  id: string;
  waktuMulai: string;
  jenisInteraksi: string | null;
  ringkasan: string | null;
  statusPenyelesaian: string;
  noTiket: string | null;
  noTelpTersamar: string | null;
};

/** Rentang waktu_mulai [dari, sampai) dalam ISO 8601. */
export type Periode = { dari: string; sampai: string };

export type RingkasanPeriode = { total: number; informasiProduk: number; pengaduanProduk: number; dieskalasi: number };

/** Penyimpanan riwayat percakapan (PROJECT_RULES 4.3): view Supabase atau implementasi tiruan. */
export interface PenyimpananRiwayat {
  /** Satu halaman percakapan dalam periode, terbaru lebih dulu. */
  daftar(kueri: { periode: Periode; offset: number; batas: number }): Promise<PercakapanTersimpan[]>;
  ringkasan(periode: Periode): Promise<RingkasanPeriode>;
}

/** Label baku status_penyelesaian (PRD-rinci Bagian 9, SRS 3.1.7). */
export const LABEL_STATUS_PENYELESAIAN: Record<StatusPenyelesaian, string> = {
  selesai_ai: 'Selesai oleh AI',
  dieskalasi: 'Dieskalasi',
  tiket_terbit: 'Tiket terbit',
  pengaduan_tidak_lengkap: 'Pengaduan tidak lengkap',
};

/** Kamus pesan PRD-rinci Lampiran A. UC-05 belum punya pesan untuk daftar, jadi dipakai pesan terdekat (UC-04, UC-08). */
export const PESAN_RIWAYAT = {
  gagalDimuat: 'Data panggilan gagal dimuat.',
  kosong: 'Data tidak tersedia pada periode tersebut.',
} as const;

// REQ-5.1: jumlah baris Daftar Percakapan per halaman.
export const UKURAN_HALAMAN = 10;
const ZONA = 'Asia/Jakarta';

export type BarisPercakapan = {
  waktu: string;
  jenis: string;
  ringkasan: string;
  labelStatus: string;
  noTiket: string;
  noTelp: string;
  tautanTranskrip: string;
};

export type DaftarPercakapan = {
  labelPeriode: string;
  ringkasan: RingkasanPeriode;
  percakapan: BarisPercakapan[];
  halaman: number;
  jumlahHalaman: number;
  /** Nomor urut baris pertama dan terakhir halaman ini; 0 bila kosong. */
  awal: number;
  akhir: number;
};

const label = (kamus: Record<string, string>, kunci: string | null) => (kunci && Object.hasOwn(kamus, kunci) ? kamus[kunci] : undefined);

const bagian = (d: Date, opsi: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat('id-ID', { timeZone: ZONA, ...opsi }).formatToParts(d).map((p) => [p.type, p.value]));

const waktuTampil = (iso: string) => {
  const b = bagian(new Date(iso), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${b.day} ${b.month} ${b.hour}:${b.minute}`;
};

// NFR-13: hanya nilai yang sudah tersamar yang boleh tampil.
const tersamar = (s: string | null) => (s && s.includes('*') ? s : '—');

/** Periode bawaan desain SRS 3.1.7: awal bulan berjalan (WIB) sampai sekarang. */
export function periodeBulanIni(sekarang: Date): Periode {
  const [tahun, bulan] = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(sekarang).split('-');
  return { dari: new Date(`${tahun}-${bulan}-01T00:00:00+07:00`).toISOString(), sampai: sekarang.toISOString() };
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

  /** REQ-5.1: daftar percakapan bulan berjalan dengan waktu, jenis, ringkasan, dan status penyelesaian, plus ringkasan periode. */
  async ambilDaftarPercakapan(kueri: { halaman?: unknown } = {}, sekarang = new Date()): Promise<DaftarPercakapan | { gagal: string }> {
    const periode = periodeBulanIni(sekarang);
    try {
      const ringkasan = await this.penyimpanan.ringkasan(periode);
      const jumlahHalaman = Math.max(1, Math.ceil(ringkasan.total / UKURAN_HALAMAN));
      // Nomor halaman dari query string; yang tidak sah atau di luar jangkauan dibawa ke halaman terdekat.
      const halaman = Math.min(jumlahHalaman, Math.max(1, Math.trunc(Number(kueri.halaman)) || 1));
      const offset = (halaman - 1) * UKURAN_HALAMAN;
      const baris = await this.penyimpanan.daftar({ periode, offset, batas: UKURAN_HALAMAN });
      const b = bagian(sekarang, { day: 'numeric', month: 'short', year: 'numeric' });
      return {
        labelPeriode: `1–${b.day} ${b.month} ${b.year}`,
        ringkasan,
        percakapan: baris.map((p) => ({
          waktu: waktuTampil(p.waktuMulai),
          jenis: label(LABEL_JENIS_INTERAKSI, p.jenisInteraksi) ?? '—',
          ringkasan: p.ringkasan?.trim() || '—',
          labelStatus: label(LABEL_STATUS_PENYELESAIAN, p.statusPenyelesaian) ?? p.statusPenyelesaian,
          noTiket: p.noTiket ?? '—',
          noTelp: tersamar(p.noTelpTersamar),
          tautanTranskrip: `/riwayat-percakapan/detail?id=${encodeURIComponent(p.id)}`,
        })),
        halaman,
        jumlahHalaman,
        awal: baris.length ? offset + 1 : 0,
        akhir: offset + baris.length,
      };
    } catch {
      return { gagal: PESAN_RIWAYAT.gagalDimuat };
    }
  }
}
