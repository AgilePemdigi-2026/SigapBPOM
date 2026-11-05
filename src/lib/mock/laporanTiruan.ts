// Rekap tiruan UC-08 untuk pengembangan lokal tanpa token Supabase, test, dan demo (PROJECT_RULES 4.3). Bentuknya mengikuti
// keluaran RPC rekap_layanan: tiga total dan rincian per tujuh hari mulai tanggal awal. Data contoh ada sejak DATA_MULAI
// sampai hari ini (WIB), sehingga periode lama seperti Januari 2025 (SRS Tabel B.9) kosong.
import type { HasilRekap, JumlahRekap, PenyimpananLaporan, Periode, RekapMingguan } from '../LaporanController.ts';

const HARI = 86_400_000;
const PANJANG_MINGGU = 7;
const DATA_MULAI = '2026-06-01';

const hariKe = (tgl: string) => Date.parse(`${tgl}T00:00:00Z`) / HARI;
const tanggal = (hari: number) => new Date(hari * HARI).toISOString().slice(0, 10);
const hariIniWib = () => hariKe(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()));

/** Angka harian tetap per tanggal, agar periode yang sama selalu memberi rekap yang sama. */
const harian = (h: number): JumlahRekap => ({ panggilan: 60 + ((h * 37) % 29), tereskalasi: 3 + ((h * 13) % 5), pengaduanSelesai: (h * 7) % 4 });

const tambah = (a: JumlahRekap, b: JumlahRekap) => {
  a.panggilan += b.panggilan;
  a.tereskalasi += b.tereskalasi;
  a.pengaduanSelesai += b.pengaduanSelesai;
};

export class PenyimpananLaporanTiruan implements PenyimpananLaporan {
  hakEkspor: boolean;

  constructor(opsi: { hakEkspor?: boolean } = {}) {
    this.hakEkspor = opsi.hakEkspor ?? true;
  }

  async rekapLayanan({ awal, akhir }: Periode): Promise<HasilRekap> {
    const [mulai, hariIni, ujung] = [hariKe(DATA_MULAI), hariIniWib(), hariKe(akhir)];
    const total = { panggilan: 0, tereskalasi: 0, pengaduanSelesai: 0 };
    const perMinggu: RekapMingguan[] = [];
    for (let a = hariKe(awal); a <= ujung; a += PANJANG_MINGGU) {
      const z = Math.min(a + PANJANG_MINGGU - 1, ujung);
      const minggu = { awal: tanggal(a), akhir: tanggal(z), panggilan: 0, tereskalasi: 0, pengaduanSelesai: 0 };
      for (let h = Math.max(a, mulai); h <= Math.min(z, hariIni); h++) tambah(minggu, harian(h));
      tambah(total, minggu);
      perMinggu.push(minggu);
    }
    return { total, perMinggu };
  }

  async bolehEkspor(): Promise<boolean> {
    return this.hakEkspor;
  }
}
