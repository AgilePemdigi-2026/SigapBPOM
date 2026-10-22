import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PESAN_LAYANAN_1, PESAN_LAYANAN_2, PANJANG_MAKS_JAWABAN, PROMPT_SISTEM,
  PembatasLaju, RiwayatPanggilan, idPanggilanSah, pesanLayanan, rapikanJawaban,
} from './percakapan.mjs';

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

test('req_1_1 pilihan menu 1 dan 2 memakai pesan baku kamus PRD', () => {
  assert.equal(pesanLayanan(1), PESAN_LAYANAN_1);
  assert.equal(pesanLayanan(2), PESAN_LAYANAN_2);
  assert.equal(pesanLayanan(3), null);
});

test('nfr_7 prompt sistem melarang menyebut status legalitas tanpa data registrasi', () => {
  assert.match(PROMPT_SISTEM, /JANGAN menyebut status atau nomor/);
  assert.match(PROMPT_SISTEM, /Jangan pernah mengarang nomor tiket/);
});

test('jawaban dibersihkan dari markdown dan dipotong di batas kalimat', () => {
  assert.equal(rapikanJawaban('**BPOM** mengawasi [obat](https://x.y).'), 'BPOM mengawasi obat.');
  const panjang = `${'Kalimat pertama cukup panjang untuk diuji. '.repeat(20)}`;
  const hasil = rapikanJawaban(panjang);
  assert.ok(hasil.length <= PANJANG_MAKS_JAWABAN);
  assert.ok(hasil.endsWith('.'));
});

test('riwayat panggilan menyimpan giliran, dibatasi, dan kedaluwarsa', () => {
  let t = 0;
  const r = new RiwayatPanggilan(() => t);
  r.tambah(ID, 'user', 'halo');
  r.tambah(ID, 'assistant', 'halo juga');
  assert.equal(r.untukModel(ID).length, 3);
  assert.equal(r.untukModel(ID)[0].role, 'system');
  for (let i = 0; i < 40; i++) r.tambah(ID, 'user', `p${i}`);
  assert.equal(r.ambil(ID).length, 24);
  t += 16 * 60 * 1000;
  assert.equal(r.ambil(ID).length, 0);
});

test('pembatas laju menolak setelah batas lalu pulih setelah jendela', () => {
  let t = 0;
  const p = new PembatasLaju(2, 1000, () => t);
  assert.ok(p.izinkan('a'));
  assert.ok(p.izinkan('a'));
  assert.equal(p.izinkan('a'), false);
  assert.ok(p.izinkan('b'));
  t = 1500;
  assert.ok(p.izinkan('a'));
});

test('id panggilan harus uuid', () => {
  assert.ok(idPanggilanSah(ID));
  assert.equal(idPanggilanSah('../etc'), false);
  assert.equal(idPanggilanSah(undefined), false);
});
