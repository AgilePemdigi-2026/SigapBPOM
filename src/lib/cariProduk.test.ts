import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlBarisCek, htmlDetailProduk, ringkasanCek, tanggalId, type TabelCek } from './cariProduk.ts';

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

const lengkap = { ...baris(1), kategori: 'Pangan Olahan', terbit: '2026-09-24', berlakuSampai: '2031-09-24', komposisi: '', kemasan: 'Botol 1 Liter', alamatPendaftar: 'Jl Siliwangi 2, Kab. Sleman', diterbitkanOleh: 'e-Registration Pangan Olahan, Direktorat Registrasi Pangan Olahan' };

test('req_1_3 baris tabel punya tombol pembuka detail yang dapat diakses keyboard', () => {
  const html = htmlBarisCek(tabel(2));
  assert.equal(html.match(/<button type="button" class="cp-buka"/g)?.length, 2);
  assert.ok(html.includes('data-detail="1"') && html.includes('aria-haspopup="dialog"'));
});

test('req_1_3 detail produk menampilkan bidang seperti cekbpom dengan tanggal Indonesia dan tanda hubung untuk yang kosong', () => {
  const html = htmlDetailProduk(lengkap);
  for (const isi of ['Pangan Olahan', 'Susu UHT 1', 'Greenfields', 'MD 400213330621', 'Tanggal Terbit', '24 September 2026', 'Masa Berlaku s/d', '24 September 2031',
    'Komposisi', 'Pendaftar', 'PT. Greenfields Indonesia', 'Jl Siliwangi 2, Kab. Sleman', 'Kemasan', 'Botol 1 Liter', 'Diterbitkan Oleh', 'Direktorat Registrasi Pangan Olahan', 'Berlaku']) {
    assert.ok(html.includes(isi), isi);
  }
  assert.match(html, /<dt>Komposisi<\/dt><dd>-<\/dd>/);
  assert.equal(tanggalId('bukan tanggal'), 'bukan tanggal');
  assert.equal(tanggalId(''), '-');
});

test('req_1_3 detail produk meloloskan teks dari cekbpom dan tetap tampil tanpa bidang tambahan', () => {
  const jahat = htmlDetailProduk({ ...lengkap, kemasan: '<script>alert(1)</script>', alamatPendaftar: '"><img src=x>', kategori: '<b>x</b>' });
  assert.ok(!/<script|<img|<b>/.test(jahat));
  const minim = htmlDetailProduk(baris(2));
  assert.ok(minim.includes('Susu UHT 2') && !minim.includes('dp-lencana'));
});
