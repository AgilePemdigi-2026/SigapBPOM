import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KANDIDAT_MAKS, PESAN_TIDAK_DITEMUKAN, htmlKartuEskalasi, htmlKartuProduk, pesanTiketEskalasi, type Produk } from './kartuPanggilan.ts';
import { PRODUK_TIRUAN, TRANSKRIP_TIRUAN } from './mock/transkripTiruan.ts';

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

test('t_f1_4_01 kartu eskalasi menyatakan jawaban dari petugas, bukan AI, dan memuat nomor tiket', () => {
  const html = htmlKartuEskalasi('ESK-20261019-0001');
  assert.match(html, /petugas, bukan oleh AI/);
  assert.ok(html.includes('ESK-20261019-0001'));
  assert.ok(!htmlKartuEskalasi('<b>').includes('<b>'));
});

test('t_f1_4_01 transkrip tiruan eskalasi memakai pesan baku kamus PRD', () => {
  const [minta, terbit] = TRANSKRIP_TIRUAN.eskalasi;
  assert.equal(minta.jawaban, 'Pertanyaan Anda akan diteruskan kepada petugas. Mohon sebutkan nomor telepon Anda.');
  assert.equal(terbit.jawaban, pesanTiketEskalasi(terbit.tiket!));
});
