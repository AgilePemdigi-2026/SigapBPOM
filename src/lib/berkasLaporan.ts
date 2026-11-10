// Penyusun berkas laporan UC-08 (REQ-8.4, T-F8.2-01): CSV dan PDF dari hasil RPC rekap_layanan. Isinya hanya judul,
// periode, tiga total, dan rincian per minggu dengan baris Total. Tidak ada data pribadi penelepon: yang masuk hanya
// angka agregat dan tanggal. Judul dan label sama dengan halaman Rekap dan Laporan (SRS 3.1.12, Tabel B.9).
import type { HasilRekap, JumlahRekap, Periode } from './LaporanController.ts';
import { buatPdf, MARGIN, type BarisPdf } from './pdfTeks.ts';

/** Pilihan "Format Berkas" (REQ-8.4). */
export const FORMAT_BERKAS = ['pdf', 'csv'] as const;
export type FormatBerkas = (typeof FORMAT_BERKAS)[number];
export type BerkasLaporan = { nama: string; tipe: string; isi: Uint8Array };

export const JUDUL_LAPORAN = 'Rekap dan Laporan Layanan';
const LABEL_TOTAL: [keyof JumlahRekap, string][] = [
  ['panggilan', 'Total Panggilan'],
  ['tereskalasi', 'Kasus Tereskalasi'],
  ['pengaduanSelesai', 'Pengaduan Selesai'],
];
const KOLOM_TABEL = ['Minggu', 'Panggilan', 'Eskalasi', 'Selesai'];

const TIPE: Record<FormatBerkas, string> = { csv: 'text/csv; charset=utf-8', pdf: 'application/pdf' };

/** YYYY-MM-DD menjadi DD-MM-YYYY, seperti label periode SRS. */
const tanggal = (s: string) => `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}`;
/** "01-09-2026 s.d. 30-09-2026" (SRS Tabel B.9). */
export const labelPeriode = ({ awal, akhir }: Periode) => `${tanggal(awal)} s.d. ${tanggal(akhir)}`;
export const namaBerkas = ({ awal, akhir }: Periode, format: FormatBerkas) => `laporan-layanan_${awal}_${akhir}.${format}`;

/** Baris tabel rekapitulasi: satu per minggu lalu Total dari RPC apa adanya, seperti TabelRekapitulasi di halaman. */
function barisTabel(rekap: HasilRekap): [string, ...number[]][] {
  const angka = (j: JumlahRekap) => [j.panggilan, j.tereskalasi, j.pengaduanSelesai];
  return [
    ...rekap.perMinggu.map((m, i): [string, ...number[]] => [`Minggu ${i + 1} (${labelPeriode(m)})`, ...angka(m)]),
    ['Total', ...angka(rekap.total)],
  ];
}

/** Satu field CSV menurut RFC 4180: diapit kutip bila memuat koma, kutip, atau akhir baris; kutip digandakan. */
export const fieldCsv = (nilai: string | number) => {
  const s = String(nilai);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV UTF-8 dengan BOM agar Excel membaca huruf dengan benar; baris diakhiri CRLF (RFC 4180). */
export function susunCsv(periode: Periode, rekap: HasilRekap): Uint8Array {
  const baris: (string | number)[][] = [
    [JUDUL_LAPORAN],
    ['Periode', labelPeriode(periode)],
    ...LABEL_TOTAL.map(([kunci, label]) => [label, rekap.total[kunci]]),
    [],
    KOLOM_TABEL,
    ...barisTabel(rekap),
  ];
  return new TextEncoder().encode(`﻿${baris.map((b) => b.map(fieldCsv).join(',')).join('\r\n')}\r\n`);
}

const fmt = (n: number) => n.toLocaleString('id-ID');

/** PDF satu atau beberapa halaman A4 dengan isi yang sama seperti CSV. */
export function susunPdf(periode: Periode, rekap: HasilRekap): Uint8Array {
  // Batas kanan tiga kolom angka; kolom Minggu mulai di margin kiri.
  const KANAN = [390, 470, 545];
  const X_NILAI = MARGIN + 130;
  const ringkasan = (label: string, nilai: string, jarakSebelum = 0): BarisPdf => ({ sel: [{ teks: label, x: MARGIN }, { teks: nilai, x: X_NILAI }], ukuran: 11, jarakSebelum });
  const tabel = barisTabel(rekap);
  const barisPdf: BarisPdf[] = [
    { sel: [{ teks: JUDUL_LAPORAN, x: MARGIN }], ukuran: 18, tebal: true },
    ringkasan('Periode', labelPeriode(periode), 6),
    ...LABEL_TOTAL.map(([kunci, label]) => ringkasan(label, fmt(rekap.total[kunci]))),
    { sel: [{ teks: 'Tabel Rekapitulasi', x: MARGIN }], ukuran: 13, tebal: true, jarakSebelum: 14 },
    { sel: KOLOM_TABEL.map((teks, i) => (i === 0 ? { teks, x: MARGIN } : { teks, x: KANAN[i - 1], rataKanan: true })), tebal: true, garisBawah: true },
    ...tabel.map(([label, ...angka], i): BarisPdf => {
      const total = i === tabel.length - 1;
      return { sel: [{ teks: label, x: MARGIN }, ...angka.map((n, k) => ({ teks: fmt(n), x: KANAN[k], rataKanan: true }))], tebal: total, garisAtas: total };
    }),
  ];
  return buatPdf(barisPdf, { judul: `${JUDUL_LAPORAN} ${labelPeriode(periode)}` });
}

export function susunBerkas(periode: Periode, rekap: HasilRekap, format: FormatBerkas): BerkasLaporan {
  const isi = format === 'csv' ? susunCsv(periode, rekap) : susunPdf(periode, rekap);
  return { nama: namaBerkas(periode, format), tipe: TIPE[format], isi };
}
