import test from 'node:test';
import assert from 'node:assert/strict';
import { buatPdf, lebarTeks, type BarisPdf } from './pdfTeks.ts';

const latin1 = (b: Uint8Array) => String.fromCharCode(...b);

/** Pemeriksaan struktur yang dibutuhkan pembaca PDF: startxref menunjuk tabel xref, dan setiap entri menunjuk objeknya. */
function periksaStruktur(pdf: string) {
  assert.ok(pdf.startsWith('%PDF-1.4\n'));
  assert.ok(pdf.endsWith('%%EOF\n'));
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(pdf)?.[1]);
  assert.equal(pdf.slice(startxref, startxref + 5), 'xref\n');
  const [, jumlah] = /^xref\n0 (\d+)\n/.exec(pdf.slice(startxref))!.map(Number);
  const entri = pdf.slice(startxref).split('\n').slice(2, 2 + jumlah);
  assert.equal(entri[0], '0000000000 65535 f ');
  entri.slice(1).forEach((e, i) => {
    assert.match(e, /^\d{10} 00000 n $/);
    const posisi = Number(e.slice(0, 10));
    assert.equal(pdf.slice(posisi, posisi + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`);
  });
  assert.match(pdf, new RegExp(`trailer\\n<< /Size ${jumlah} /Root 1 0 R /Info 5 0 R >>`));
  // /Length setiap stream sama dengan jumlah byte di antara "stream\n" dan "\nendstream".
  for (const [, panjang, isi] of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) assert.equal(isi.length, Number(panjang));
  return jumlah;
}

test('req_8_4 PDF minimal punya header, objek, xref, dan trailer yang konsisten', () => {
  const pdf = latin1(buatPdf([{ sel: [{ teks: 'Halo', x: 50 }] }], { judul: 'Uji' }));
  assert.equal(periksaStruktur(pdf), 8);
  assert.match(pdf, /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
  assert.match(pdf, /\/Title \(Uji\)/);
  assert.match(pdf, /\/MediaBox \[0 0 595 842\]/);
  assert.match(pdf, /BT \/F1 10 Tf 50 780.5 Td \(Halo\) Tj ET/);
});

test('req_8_4 PDF meng-escape kurung dan backslash, dan mengganti karakter di luar WinAnsi', () => {
  const pdf = latin1(buatPdf([{ sel: [{ teks: 'a (b) \\ c – é ✓', x: 50 }] }]));
  assert.ok(pdf.includes('(a \\(b\\) \\\\ c \x96 \xe9 ?) Tj'));
});

test('req_8_4 PDF memakai Helvetica-Bold untuk baris tebal dan menggambar garis tabel', () => {
  const pdf = latin1(buatPdf([{ sel: [{ teks: 'Total', x: 50 }], tebal: true, garisAtas: true, garisBawah: true }]));
  assert.match(pdf, /BT \/F2 10 Tf/);
  assert.equal(pdf.match(/ l S/g)?.length, 2);
});

test('req_8_4 teks rata kanan berakhir tepat di batas x', () => {
  // Angka Helvetica 556/1000 em: "2.148" = 4 x 556 + 278 = 2502 unit, 25,02 pt pada 10 pt.
  assert.equal(lebarTeks('2.148', 10), 25.02);
  const pdf = latin1(buatPdf([{ sel: [{ teks: '2.148', x: 400, rataKanan: true }] }]));
  assert.match(pdf, /BT \/F1 10 Tf 374.98 /);
});

test('req_8_4 baris yang tidak muat pindah ke halaman berikutnya', () => {
  const baris: BarisPdf[] = Array.from({ length: 120 }, (_, i) => ({ sel: [{ teks: `Baris ${i + 1}`, x: 50 }] }));
  const pdf = latin1(buatPdf(baris));
  const halaman = Number(/\/Count (\d+)/.exec(pdf)?.[1]);
  assert.ok(halaman >= 3);
  assert.equal(periksaStruktur(pdf), 6 + halaman * 2);
  assert.equal(pdf.match(/\/Type \/Page /g)?.length, halaman);
  assert.equal(pdf.match(/\) Tj ET/g)?.length, 120);
  // Tidak ada teks yang jatuh di bawah margin bawah 50 pt.
  for (const [, y] of pdf.matchAll(/Tf [\d.]+ ([\d.]+) Td/g)) assert.ok(Number(y) >= 50, y);
});
