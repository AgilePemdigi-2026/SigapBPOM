import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldCsv, labelPeriode, namaBerkas, susunBerkas, susunCsv, susunPdf } from './berkasLaporan.ts';
import { daftarPeriode, type HasilRekap } from './LaporanController.ts';

const SEPTEMBER = { awal: '2026-09-01', akhir: '2026-09-30' };
const minggu = (awal: string, akhir: string, panggilan: number, tereskalasi: number, pengaduanSelesai: number) => ({ awal, akhir, panggilan, tereskalasi, pengaduanSelesai });
const REKAP: HasilRekap = {
  total: { panggilan: 2148, tereskalasi: 163, pengaduanSelesai: 97 },
  perMinggu: [
    minggu('2026-09-01', '2026-09-07', 512, 39, 22),
    minggu('2026-09-08', '2026-09-14', 498, 36, 24),
    minggu('2026-09-15', '2026-09-21', 521, 41, 25),
    minggu('2026-09-22', '2026-09-28', 476, 35, 19),
    minggu('2026-09-29', '2026-09-30', 141, 12, 7),
  ],
};

const latin1 = (b: Uint8Array) => String.fromCharCode(...b);

test('req_8_4 CSV berisi judul, periode, tiga total, dan rincian per minggu dengan baris Total', () => {
  const csv = susunCsv(SEPTEMBER, REKAP);
  // BOM UTF-8 agar Excel membaca berkas sebagai UTF-8.
  assert.deepEqual([...csv.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(
    new TextDecoder().decode(csv),
    [
      'Rekap dan Laporan Layanan',
      'Periode,01-09-2026 s.d. 30-09-2026',
      'Total Panggilan,2148',
      'Kasus Tereskalasi,163',
      'Pengaduan Selesai,97',
      '',
      'Minggu,Panggilan,Eskalasi,Selesai',
      'Minggu 1 (01-09-2026 s.d. 07-09-2026),512,39,22',
      'Minggu 2 (08-09-2026 s.d. 14-09-2026),498,36,24',
      'Minggu 3 (15-09-2026 s.d. 21-09-2026),521,41,25',
      'Minggu 4 (22-09-2026 s.d. 28-09-2026),476,35,19',
      'Minggu 5 (29-09-2026 s.d. 30-09-2026),141,12,7',
      // Total dari RPC apa adanya, tidak dijumlah ulang.
      'Total,2148,163,97',
      '',
    ].join('\r\n'),
  );
});

test('req_8_4 field CSV di-escape menurut RFC 4180', () => {
  assert.equal(fieldCsv('Minggu 1'), 'Minggu 1');
  assert.equal(fieldCsv(2148), '2148');
  assert.equal(fieldCsv('a,b'), '"a,b"');
  assert.equal(fieldCsv('kata "kutip"'), '"kata ""kutip"""');
  assert.equal(fieldCsv('dua\nbaris'), '"dua\nbaris"');
  assert.equal(fieldCsv('cr\rsaja'), '"cr\rsaja"');
});

test('req_8_4 PDF berisi judul, periode, tiga total, tabel per minggu, dan baris Total', () => {
  const pdf = latin1(susunPdf(SEPTEMBER, REKAP));
  assert.ok(pdf.startsWith('%PDF-'));
  for (const teks of [
    'Rekap dan Laporan Layanan',
    'Periode',
    '01-09-2026 s.d. 30-09-2026',
    'Total Panggilan',
    'Kasus Tereskalasi',
    'Pengaduan Selesai',
    'Tabel Rekapitulasi',
    'Minggu',
    'Panggilan',
    'Eskalasi',
    'Selesai',
    'Minggu 5 \\(29-09-2026 s.d. 30-09-2026\\)',
    'Total',
    // Angka dengan pemisah ribuan seperti kartu di halaman.
    '2.148',
    '163',
    '97',
  ]) {
    assert.ok(pdf.includes(`(${teks}) Tj`), teks);
  }
  // Baris Total tebal dengan garis di atasnya.
  assert.match(pdf, /l S\nBT \/F2 10 Tf [\d.]+ [\d.]+ Td \(Total\) Tj ET/);
});

test('req_8_4 label periode berkas sama dengan pilihan Periode di halaman', () => {
  const september = daftarPeriode(new Date('2026-10-15T00:00:00Z')).find((p) => p.nilai === '2026-09')!;
  assert.equal(labelPeriode(september), september.label);
  assert.equal(labelPeriode(SEPTEMBER), '01-09-2026 s.d. 30-09-2026');
});

test('req_8_4 nama berkas memuat periode dan format', () => {
  assert.equal(namaBerkas(SEPTEMBER, 'csv'), 'laporan-layanan_2026-09-01_2026-09-30.csv');
  assert.deepEqual(
    { ...susunBerkas(SEPTEMBER, REKAP, 'pdf'), isi: undefined },
    { nama: 'laporan-layanan_2026-09-01_2026-09-30.pdf', tipe: 'application/pdf', isi: undefined },
  );
  assert.equal(susunBerkas(SEPTEMBER, REKAP, 'csv').tipe, 'text/csv; charset=utf-8');
});

test('req_8_4 berkas tidak memuat data pribadi walau rekap membawa field tambahan', () => {
  // Field yang tidak dikenal (misalnya bila RPC kelak salah mengembalikan data penelepon) tidak ikut ke berkas.
  const bocor = {
    total: { ...REKAP.total, nama_penelepon: 'Budi Santoso' },
    perMinggu: REKAP.perMinggu.map((m) => ({ ...m, nomorTelepon: '081234567890', namaPenelepon: 'Siti Aminah' })),
  } as unknown as HasilRekap;
  const pdf = latin1(susunPdf(SEPTEMBER, bocor));
  assert.doesNotMatch(pdf, /Budi|Siti|Santoso|Aminah|0812/);
  // Teks yang tampil di PDF (operand Tj), tanpa offset xref yang memang berupa deret angka panjang.
  const teksPdf = [...pdf.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1]).join('\n');
  for (const isi of [new TextDecoder().decode(susunCsv(SEPTEMBER, bocor)), teksPdf]) {
    assert.doesNotMatch(isi, /Budi|Siti|Santoso|Aminah/);
    assert.doesNotMatch(isi, /(\+62|\b0)8\d{8,}/);
    assert.doesNotMatch(isi, /\d{9,}/);
  }
});
