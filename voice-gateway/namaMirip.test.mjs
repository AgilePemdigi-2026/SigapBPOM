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
  assert.deepEqual(potonganCari('panteen shampo'), ['pant', 'ante', 'sham', 'hamp']);
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
