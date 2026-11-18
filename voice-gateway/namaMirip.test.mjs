import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AMBANG_MIRIP, bunyi, jarak, kemiripan, potonganCari, saranNama } from './namaMirip.mjs';

test('req_1_4 bunyi menyamakan ejaan yang terdengar sama', () => {
  assert.equal(bunyi('Panteen'), 'panten');
  assert.equal(bunyi('Philips'), 'filips');
  assert.equal(bunyi('Quaker'), 'kuaker');
  assert.equal(bunyi('Zwitsal'), 'switsal');
});

test('req_1_4 jarak menghitung tukar dua huruf bersebelahan sebagai satu langkah', () => {
  assert.equal(jarak('panteen', 'pantene'), 1);
  assert.equal(jarak('sunslik', 'sunsilk'), 1);
  assert.equal(jarak('abc', 'abc'), 0);
});

test('req_1_4 kemiripan tinggi untuk salah dengar, rendah untuk merek lain', () => {
  assert.ok(kemiripan('panteen', 'pantene') >= 0.85);
  assert.ok(kemiripan('fantene', 'pantene') >= 0.85);
  assert.ok(kemiripan('sunslik', 'sunsilk') >= 0.85);
  assert.ok(kemiripan('krim', 'prima') < AMBANG_MIRIP);
  assert.ok(kemiripan('panteen', 'panda') < AMBANG_MIRIP);
});

test('req_1_4 potongan cari memakai empat huruf awal dan empat huruf setelah huruf pertama', () => {
  assert.deepEqual(potonganCari('panteen sachet'), ['pant', 'ante', 'sach', 'ache']);
  // Jenis produk ("shampo") bukan merek, jadi tidak ikut dicari.
  assert.deepEqual(potonganCari('panteen shampo'), ['pant', 'ante']);
  // Kata pendek tidak dicari: terlalu banyak merek yang cocok.
  assert.deepEqual(potonganCari('teh'), []);
});

test('req_1_4 saran nama: merek mirip diurutkan dari yang paling mirip, kata lain dalam nama dipertahankan', () => {
  const saran = saranNama('panteen shampo', ['PANTENE', 'PANTHER', 'HELLO PANDA', 'Pantai Manado']);
  assert.equal(saran[0].label, 'Pantene');
  assert.equal(saran[0].kueri, 'pantene shampo');
  assert.ok(saran.every((s) => s.skor >= AMBANG_MIRIP));
  assert.ok(!saran.some((s) => s.label === 'Panda'));
  // Merek yang persis sama tidak disarankan: nama itu sudah dicari dan memang tidak ditemukan.
  assert.deepEqual(saranNama('pantene', ['PANTENE']), []);
});

test('req_1_4 jenis produk di depan nama tidak dicarikan merek mirip', async () => {
  const { kataDicari } = await import('./namaMirip.mjs');
  // "milk" juga kata umum (padanan susu), jadi hanya "ultra" yang dicarikan merek mirip.
  assert.deepEqual(kataDicari('susu ultra milk'), ['ultra']);
  assert.deepEqual(kataDicari('shampo panteen'), ['panteen']);
});

test('req_1_3 memuatKata: padanan, ejaan mirip, dan spasi diabaikan; kata pendek hanya cocok sebagai kata utuh', async () => {
  const { memuatKata, padanan, bolehDiabaikan, jenisProduk } = await import('./namaMirip.mjs');
  assert.ok(memuatKata('Susu UHT Rasa Cokelat ULTRA MILK', 'coklat'));
  assert.ok(memuatKata('Susu UHT Rasa Cokelat ULTRA MILK', 'ultramilk'));
  assert.ok(memuatKata('Barber Daily Dandruff Shampoo', 'ketombe'));
  assert.ok(memuatKata('Barber Daily Dandruff Shampoo', 'shampo'));
  assert.ok(memuatKata('Antibacterial Bodywash LIFEBUOY', 'sabun'));
  assert.ok(!memuatKata('Minyak Kayu Putih', 'mi'));
  assert.ok(memuatKata('Mi Instan Goreng INDOMIE', 'mie'));
  assert.ok(!memuatKata('Susu Bubuk Rasa Madu', 'coklat'));
  assert.deepEqual(padanan('coklat'), ['cokelat', 'chocolate', 'choco']);
  assert.ok(bolehDiabaikan('obat') && !bolehDiabaikan('susu'));
  assert.ok(jenisProduk('sabun') && !jenisProduk('barber'));
});
