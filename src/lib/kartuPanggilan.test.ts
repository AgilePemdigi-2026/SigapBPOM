import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KANDIDAT_MAKS, PESAN_TIDAK_DITEMUKAN, htmlKartuProduk, type Produk } from './kartuPanggilan.ts';
import { PRODUK_TIRUAN } from './mock/transkripTiruan.ts';

const SUSU = PRODUK_TIRUAN[0];

test('t_f1_2_01 kartu produk tunggal memuat nama, nomor izin edar, status berteks, pendaftar, dan sumber', () => {
  const html = htmlKartuProduk({ jenis: 'tunggal', produk: SUSU });
  for (const isi of ['Susu Formula Sehat', 'BPOM RI MD 865009001234', 'Berlaku', SUSU.pendaftar, `Sumber: ${SUSU.sumber}`]) {
    assert.ok(html.includes(isi), isi);
  }
  assert.match(html, /icon-circle-check/);
});

test('req_1_5 kartu kandidat menampilkan jumlah hasil dan paling banyak tiga kandidat', () => {
  const lima: Produk[] = Array.from({ length: 5 }, (_, i) => ({ ...SUSU, nama: `Produk ${i + 1}` }));
  const html = htmlKartuProduk({ jenis: 'kandidat', produk: lima });
  assert.match(html, /5 hasil ditemukan, 3 teratas/);
  assert.equal(html.match(/<li>/g)?.length, KANDIDAT_MAKS);
  assert.ok(!html.includes('Produk 4'));
});

test('t_f1_2_01 kartu produk tidak ditemukan memakai pesan baku kamus PRD', () => {
  assert.ok(htmlKartuProduk({ jenis: 'tidak_ditemukan' }).includes(PESAN_TIDAK_DITEMUKAN));
});

test('isi kartu di-escape', () => {
  const html = htmlKartuProduk({ jenis: 'tunggal', produk: { ...SUSU, nama: '<img onerror=x>' } });
  assert.ok(!html.includes('<img'));
});
