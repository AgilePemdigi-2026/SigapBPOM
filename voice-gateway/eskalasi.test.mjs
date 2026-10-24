import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PESAN_BUTUH_PETUGAS, PESAN_MINTA_ULANG_TELEPON, PenerbitTiketTiruan, butuhPetugas, nomorTeleponDariUcapan, pesanTiketEskalasi,
} from './eskalasi.mjs';
import { PROMPT_SISTEM, RiwayatPanggilan, teksUntukSuara } from './percakapan.mjs';

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

test('t_f1_4_03 pesan eskalasi sama persis dengan kamus PRD Lampiran A', () => {
  assert.equal(PESAN_BUTUH_PETUGAS, 'Pertanyaan Anda akan diteruskan kepada petugas. Mohon sebutkan nomor telepon Anda.');
  assert.ok(PESAN_BUTUH_PETUGAS.endsWith(PESAN_MINTA_ULANG_TELEPON));
  assert.equal(pesanTiketEskalasi('ESK-20261019-0001'), 'Nomor tiket Anda ESK-20261019-0001. Jawaban petugas akan dikirim melalui SMS.');
  assert.ok(PROMPT_SISTEM.includes(PESAN_BUTUH_PETUGAS));
});

test('nfr_6 pertanyaan medis dan keamanan konsumsi diteruskan ke petugas', () => {
  for (const u of [
    'Apakah obat batuk ini aman untuk ibu hamil?',
    'Berapa dosis paracetamol untuk anak 5 tahun?',
    'Boleh nggak minum jamu ini kalau saya punya darah tinggi?',
    'Efek samping obat ini apa saja?',
    'Anak saya demam, obat apa yang cocok?',
    'Susu formula ini aman diminum bayi saya?',
  ]) assert.ok(butuhPetugas(u), u);
  for (const u of [
    'Apa bedanya obat bebas dan obat keras?',
    'Apa syarat izin edar suplemen kesehatan?',
    'Bagaimana cara cek nomor registrasi kosmetik?',
    'Apa tugas BPOM?',
  ]) assert.ok(!butuhPetugas(u), u);
});

test('t_f1_4_02 nomor telepon dari transkrip angka atau kata, format Indonesia', () => {
  assert.equal(nomorTeleponDariUcapan('0812 3456 7890'), '081234567890');
  assert.equal(nomorTeleponDariUcapan('Nomor saya 0812-3456-7890 ya.'), '081234567890');
  assert.equal(nomorTeleponDariUcapan('+62 812 3456 7890'), '081234567890');
  assert.equal(nomorTeleponDariUcapan('Nol delapan satu dua tiga empat lima enam tujuh delapan sembilan nol.'), '081234567890');
  assert.equal(nomorTeleponDariUcapan('plus enam dua delapan satu dua tiga empat lima enam tujuh delapan'), '0812345678');
});

test('t_f1_4_02 nomor tidak valid ditolak sehingga agen meminta ulang', () => {
  for (const u of ['12345', 'saya tidak tahu', '0812', '02112345678', 'nol delapan satu']) assert.equal(nomorTeleponDariUcapan(u), null, u);
});

test('t_f1_4_03 tiket tiruan berformat ESK-YYYYMMDD-NNNN dan berurutan per hari', async () => {
  let t = new Date('2026-10-19T03:00:00Z');
  const p = new PenerbitTiketTiruan(() => t);
  const data = { percakapanId: ID, nomorTelepon: '081234567890', pertanyaan: 'Aman untuk ibu hamil?' };
  assert.equal(await p.terbitkan(data), 'ESK-20261019-0001');
  assert.equal(await p.terbitkan(data), 'ESK-20261019-0002');
  t = new Date('2026-10-20T03:00:00Z');
  assert.equal(await p.terbitkan(data), 'ESK-20261020-0001');
  await assert.rejects(p.terbitkan({ ...data, nomorTelepon: '' }));
});

test('t_f1_4_03 status eskalasi per panggilan dan layanan yang dipilih', () => {
  const r = new RiwayatPanggilan();
  assert.equal(r.eskalasi(ID), null);
  assert.equal(r.layanan(ID), null);
  r.pilihLayanan(ID, 1);
  r.mulaiEskalasi(ID, 'Apakah obat batuk ini aman untuk ibu hamil?');
  assert.equal(r.eskalasi(ID), 'Apakah obat batuk ini aman untuk ibu hamil?');
  r.selesaiEskalasi(ID);
  assert.equal(r.eskalasi(ID), null);
  assert.equal(r.layanan(ID), 1);
});

test('nomor tiket dieja per digit untuk TTS', () => {
  assert.equal(teksUntukSuara(pesanTiketEskalasi('ESK-20261019-0001')),
    'Nomor tiket Anda E S K, dua nol dua enam satu nol satu sembilan, nol nol nol satu. Jawaban petugas akan dikirim melalui SMS.');
});

