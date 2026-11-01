import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlBarisCek, ringkasanCek, type TabelCek } from './cariProduk.ts';

const baris = (n: number) => ({ nama: `Susu UHT ${n}`, merek: 'Greenfields', nomorIzinEdar: `MD 40021333062${n}`, status: 'Berlaku' as const, pendaftar: 'PT. Greenfields Indonesia' });
const tabel = (n: number, total = n): TabelCek => ({ kueri: 'susu greenfield', total, dibaca: Math.min(n, 3), galat: false, baris: Array.from({ length: n }, (_, i) => baris(i + 1)) });

test('req_1_3 ringkasan panel Cari Produk: jumlah, tidak ditemukan, dan gangguan dinyatakan dengan teks', () => {
  assert.deepEqual(ringkasanCek(tabel(10, 209)), { jenis: 'ok', teks: '209 produk ditemukan, menampilkan 10 teratas.' });
  assert.deepEqual(ringkasanCek(tabel(2)), { jenis: 'ok', teks: '2 produk ditemukan.' });
  assert.equal(ringkasanCek(tabel(0)).jenis, 'kosong');
  assert.match(ringkasanCek(tabel(0)).teks, /susu greenfield/);
  assert.equal(ringkasanCek({ ...tabel(0), galat: true }).jenis, 'galat');
});

test('br_7 tabel menandai paling banyak tiga baris yang dibacakan AI dan meloloskan teks dari cekbpom', () => {
  const html = htmlBarisCek(tabel(5));
  assert.equal(html.match(/<tr class="dibaca"/g)?.length, 3);
  assert.equal(html.match(/Dibacakan/g)?.length, 3);
  for (const isi of ['MD 400213330621', 'Susu UHT 1', 'Merek: Greenfields', 'PT. Greenfields Indonesia', 'Berlaku']) assert.ok(html.includes(isi), isi);
  const jahat = htmlBarisCek({ ...tabel(1), baris: [{ ...baris(1), nama: '<img src=x onerror=alert(1)>' }] });
  assert.ok(!jahat.includes('<img'), 'nama produk di-escape');
});
