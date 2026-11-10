// Penulis PDF minimal untuk berkas laporan UC-08 (REQ-8.4): teks berbaris dan garis tabel pada kertas A4, dengan font
// standar Helvetica sehingga tidak ada font yang perlu disematkan. Isi halaman tidak dikompresi; halaman baru dibuat
// otomatis bila baris tidak muat. Cukup untuk laporan berisi angka, sengaja tanpa dependensi.

export type TeksPdf = { teks: string; x: number; rataKanan?: boolean };
export type BarisPdf = {
  sel: TeksPdf[];
  /** Ukuran huruf dalam pt; bawaan 10. */
  ukuran?: number;
  tebal?: boolean;
  /** Ruang kosong tambahan sebelum baris, dalam pt. */
  jarakSebelum?: number;
  garisAtas?: boolean;
  garisBawah?: boolean;
};

// A4 dalam pt (1/72 inci) dan margin halaman.
export const LEBAR_HALAMAN = 595;
export const TINGGI_HALAMAN = 842;
export const MARGIN = 50;
const UKURAN_BAWAAN = 10;
const SPASI_BARIS = 1.6;

// Lebar glyph Helvetica (AFM, per 1000 unit em) untuk kode 32 sampai 126. Angka, titik, dan koma pada Helvetica-Bold
// sama lebarnya, jadi rata kanan kolom angka tetap tepat untuk kedua font. Karakter lain dihitung 556.
const LEBAR_HELVETICA = (
  '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 ' +
  '584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 ' +
  '278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 ' +
  '500 334 260 334 584'
)
  .split(' ')
  .map(Number);

/** Teks ke kode WinAnsi (satu byte per karakter); karakter di luar WinAnsi menjadi "?". */
function winAnsi(teks: string): string {
  let hasil = '';
  for (const ch of teks.normalize('NFC')) {
    const c = ch.codePointAt(0)!;
    if (c === 0x2013) hasil += '\x96';
    else if (c === 0x2014) hasil += '\x97';
    else hasil += (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) ? ch : '?';
  }
  return hasil;
}

/** Lebar teks dalam pt pada ukuran huruf tertentu. */
export function lebarTeks(teks: string, ukuran: number): number {
  let unit = 0;
  for (const ch of winAnsi(teks)) unit += LEBAR_HELVETICA[ch.charCodeAt(0) - 32] ?? 556;
  return (unit * ukuran) / 1000;
}

/** String literal PDF: backslash dan kurung di-escape. */
const literal = (teks: string) => `(${winAnsi(teks).replace(/[\\()]/g, '\\$&')})`;
const angka = (n: number) => String(Math.round(n * 100) / 100);

/** Bagi baris ke halaman dan ubah menjadi operator isi halaman PDF. */
function susunHalaman(baris: BarisPdf[]): string[] {
  const halaman: string[][] = [[]];
  let y = TINGGI_HALAMAN - MARGIN;
  for (const b of baris) {
    const ukuran = b.ukuran ?? UKURAN_BAWAAN;
    const tinggi = ukuran * SPASI_BARIS;
    y -= b.jarakSebelum ?? 0;
    if (y - tinggi < MARGIN) {
      halaman.push([]);
      y = TINGGI_HALAMAN - MARGIN;
    }
    const isi = halaman.at(-1)!;
    const garis = (gy: number) => isi.push(`0.6 w ${MARGIN} ${angka(gy)} m ${LEBAR_HALAMAN - MARGIN} ${angka(gy)} l S`);
    if (b.garisAtas) garis(y);
    const dasar = y - ukuran * 1.15;
    for (const s of b.sel) {
      const x = s.rataKanan ? s.x - lebarTeks(s.teks, ukuran) : s.x;
      isi.push(`BT /${b.tebal ? 'F2' : 'F1'} ${ukuran} Tf ${angka(x)} ${angka(dasar)} Td ${literal(s.teks)} Tj ET`);
    }
    y -= tinggi;
    if (b.garisBawah) garis(y);
  }
  return halaman.map((h) => h.join('\n'));
}

/** Satu dokumen PDF 1.4 lengkap dengan tabel xref; byte keluaran berupa WinAnsi/Latin-1. */
export function buatPdf(baris: BarisPdf[], opsi: { judul?: string } = {}): Uint8Array {
  const isiHalaman = susunHalaman(baris);
  const font = (nama: string) => `<< /Type /Font /Subtype /Type1 /BaseFont /${nama} /Encoding /WinAnsiEncoding >>`;
  // Objek 1 sampai 5 tetap; setiap halaman memakai dua objek berikutnya (Page lalu isi halamannya).
  const nomorHalaman = isiHalaman.map((_, i) => 6 + i * 2);
  const objek = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${nomorHalaman.map((n) => `${n} 0 R`).join(' ')}] /Count ${isiHalaman.length} >>`,
    font('Helvetica'),
    font('Helvetica-Bold'),
    `<< /Title ${literal(opsi.judul ?? '')} /Producer (SIGAP) >>`,
  ];
  isiHalaman.forEach((isi, i) => {
    objek.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LEBAR_HALAMAN} ${TINGGI_HALAMAN}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${nomorHalaman[i] + 1} 0 R >>`,
      `<< /Length ${isi.length} >>\nstream\n${isi}\nendstream`,
    );
  });

  // Komentar kedua berisi byte di atas 127 agar berkas dikenali sebagai biner (PDF 1.4, 7.5.2).
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const posisi = objek.map((isi, i) => {
    const awal = pdf.length;
    pdf += `${i + 1} 0 obj\n${isi}\nendobj\n`;
    return awal;
  });
  const xref = pdf.length;
  // Setiap entri xref tepat 20 byte termasuk akhir baris dua karakter " \n".
  pdf += `xref\n0 ${objek.length + 1}\n0000000000 65535 f \n${posisi.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objek.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(pdf, (c) => c.charCodeAt(0));
}
