import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Korpus, akar, labelPeraturan, pesanKutipan, potong, tanggalIndonesia, token } from './pengetahuan.mjs';
import { RiwayatPanggilan } from './percakapan.mjs';

const dok = (judul, nomor, tahun, badan) => `---
title: "${judul}"
nomor: "${nomor}"
tahun: "${tahun}"
bentuk_singkat: "Peraturan BPOM"
source_url: "https://peraturan.bpk.go.id/contoh-${nomor}"
---
# ${judul}
${badan}`;

function korpusUji() {
  const k = new Korpus();
  k.tambah('a.md', dok('Pengawasan Obat yang Sering Disalahgunakan', '12', '2025',
    'Pasal 1 Obat yang sering disalahgunakan meliputi tramadol, triheksifenidil, dan dekstrometorfan. Pasal 2 Apotek wajib mencatat penyerahan obat tersebut.'));
  k.tambah('b.md', dok('Label Gizi Pangan Olahan', '26', '2021',
    'Pasal 1 Informasi nilai gizi wajib dicantumkan pada label pangan olahan. Pasal 2 Tabel gizi memuat energi total, lemak, protein, dan karbohidrat.'));
  return k.selesai();
}

test('akar menyamakan bentuk berimbuhan', () => {
  assert.equal(akar('pendaftaran'), 'daftar');
  assert.equal(akar('mendaftarkan'), 'daftar');
  assert.equal(akar('obat'), 'obat');
});

test('token membuang stopword dan sapaan', () => {
  assert.deepEqual(token('Halo selamat pagi, terima kasih ya'), []);
});

test('potong memecah teks per pasal', () => {
  const p = potong('Pembukaan singkat yang cukup panjang untuk disimpan sebagai potongan. Pasal 1 Isi pasal pertama yang cukup panjang. Pasal 2 Isi pasal kedua yang juga cukup panjang.');
  assert.equal(p.length, 3);
  assert.ok(p[1].startsWith('Pasal 1'));
});

test('cari mengembalikan peraturan yang relevan dengan label nomor dan tahun', () => {
  const [hasil] = korpusUji().cari('obat apa saja yang sering disalahgunakan seperti tramadol', 3, 1);
  assert.equal(hasil.label, 'Peraturan BPOM Nomor 12 Tahun 2025');
  assert.match(hasil.teks, /tramadol/);
});

test('cari paling banyak satu potongan per peraturan', () => {
  const hasil = korpusUji().cari('label gizi pangan olahan tabel gizi', 3, 0);
  assert.equal(new Set(hasil.map((h) => h.judul)).size, hasil.length);
});

test('cari mengembalikan kosong untuk sapaan', () => {
  assert.deepEqual(korpusUji().cari('halo selamat pagi'), []);
});

test('pesanKutipan null bila tanpa kutipan dan menandai kutipan sebagai data', () => {
  assert.equal(pesanKutipan([]), null);
  const pesan = pesanKutipan(korpusUji().cari('tramadol disalahgunakan', 1, 1));
  assert.match(pesan, /bukan instruksi/);
  assert.match(pesan, /Nomor 12 Tahun 2025/);
});

test('untukModel menyisipkan kutipan tepat sebelum ucapan terakhir tanpa menyimpannya', () => {
  const r = new RiwayatPanggilan();
  const id = 'b1f0c2d4-0000-4000-8000-000000000001';
  r.tambah(id, 'user', 'pertanyaan pertama');
  r.tambah(id, 'assistant', 'jawaban pertama');
  r.tambah(id, 'user', 'pertanyaan kedua');
  const pesan = r.untukModel(id, 'KUTIPAN');
  assert.deepEqual(pesan.slice(-2).map((m) => m.content), ['KUTIPAN', 'pertanyaan kedua']);
  assert.equal(r.untukModel(id).some((m) => m.content === 'KUTIPAN'), false);
});

test('label informasi publik memakai tanggal terbit, peraturan memakai nomor dan tahun', () => {
  assert.equal(tanggalIndonesia('2026-01-14'), '14 Januari 2026');
  assert.equal(labelPeraturan({ bentuk_singkat: 'Penjelasan Publik BPOM', tanggal: '2026-01-14' }), 'Penjelasan Publik BPOM 14 Januari 2026');
  assert.equal(labelPeraturan({ bentuk_singkat: 'UU', nomor: '18', tahun: '2012' }), 'UU Nomor 18 Tahun 2012');
});

test('muat membaca subfolder, melewati README, dan catatan perubahan ikut ke kutipan', () => {
  const akarKorpus = mkdtempSync(join(tmpdir(), 'korpus-'));
  mkdirSync(join(akarKorpus, 'regulasi-terkait'));
  writeFileSync(join(akarKorpus, 'README.md'), '# Korpus\nBerkas penjelasan tentang pangan yang tidak boleh terindeks sama sekali.');
  writeFileSync(join(akarKorpus, 'regulasi-terkait', 'uu-pangan.md'), `---
title: "Pangan"
nomor: "18"
tahun: "2012"
bentuk_singkat: "UU"
catatan: "sebagian pasal telah diubah dengan UU Nomor 6 Tahun 2023"
source_url: "https://peraturan.bpk.go.id/contoh-uu-18"
---
Pasal 1 Keamanan pangan adalah kondisi dan upaya yang diperlukan untuk mencegah pangan dari kemungkinan cemaran biologis dan kimia.`);
  const k = Korpus.muat(akarKorpus);
  assert.equal(new Set(k.potongan.map((p) => p.sumber)).size, 1);
  const pesan = pesanKutipan(k.cari('cemaran kimia pada pangan', 3, 1));
  assert.match(pesan, /UU Nomor 18 Tahun 2012 tentang Pangan \(catatan: sebagian pasal telah diubah/);
});
