import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PESAN_BUTUH_PETUGAS, PESAN_MINTA_ULANG_TELEPON, PembatasTiket, PenerbitTiketTiruan, butuhPetugas, nomorTeleponDariUcapan, pesanTiketEskalasi,
  samarkanDeretTelepon,
} from './eskalasi.mjs';
import { kueriProduk } from './cekbpom.mjs';
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
    'Apakah obat X yang terdaftar aman untuk ibu hamil?',
    'Apakah paracetamol terdaftar, berapa dosis untuk anak?',
    'Apakah obat X yang terdaftar bisa diminum anak?',
    'Apakah obat X terdaftar dan bisa untuk anak?',
    'Apakah jamu ini cocok untuk ibu hamil?',
  ]) assert.ok(butuhPetugas(u), u);
  for (const u of [
    'Apa bedanya obat bebas dan obat keras?',
    'Apa syarat izin edar suplemen kesehatan?',
    'Bagaimana cara cek nomor registrasi kosmetik?',
    'Apa tugas BPOM?',
  ]) assert.ok(!butuhPetugas(u), u);
});

test('req_1_3 nfr_6 pertanyaan legalitas produk anak dan bayi dicek di cekbpom, bukan dieskalasi', () => {
  for (const u of [
    'Apakah Paracetamol Sirup Anak sudah terdaftar di BPOM?',
    'Apakah susu formula bayi merek Sehat terdaftar?',
    'Apakah bedak bayi Y punya izin edar?',
    'Apakah susu formula bayi merek Sehat sudah ada BPOM-nya?',
    'Apakah bedak bayi Y resmi?',
  ]) {
    assert.ok(!butuhPetugas(u), u);
    assert.ok(kueriProduk(u), u);
  }
  assert.deepEqual(kueriProduk('Apakah Paracetamol Sirup Anak sudah terdaftar di BPOM?'), { nama: 'paracetamol sirup anak' });
});

test('nfr_13 deret nomor telepon disamarkan, nomor izin edar, tanggal, dan tiket tidak', () => {
  for (const u of ['0812 345', '0812-3456-7890', '+62 812 3456 7890', 'nol delapan satu dua tiga', 'kosong delapan satu dua']) {
    assert.equal(samarkanDeretTelepon(u), '(nomor telepon)', u);
  }
  assert.equal(samarkanDeretTelepon('Apakah obat X aman untuk ibu hamil? nomor saya 0812-3456-7890'), 'Apakah obat X aman untuk ibu hamil? nomor saya (nomor telepon)');
  for (const u of [
    'POM TR 083 245 461', 'SD 051 234 567', 'DKL 0812345678A1', 'MD 865009001234', 'kedaluwarsa 05-06-2026', 'kedaluwarsa 15-08-2026',
    'ESK-20261019-0001', 'umur 0 - 12 bulan', 'Tahun 2019', 'HaloBPOM 1500533', 'layanan 1', 'dua botol', 'satu dua tiga empat lima produk',
  ]) assert.equal(samarkanDeretTelepon(u), u, u);
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


test('penerbitan tiket dibatasi per panggilan, per IP, dan per nomor, lalu pulih esok hari', () => {
  let t = Date.parse('2026-10-19T03:00:00Z');
  const b = new PembatasTiket({ perPanggilan: 1, perIpHarian: 2, perNomorHarian: 2 }, () => t);
  assert.equal(b.cadangkan('p1', 'ip1', '081234567890'), null);
  assert.equal(b.cadangkan('p1', 'ip1', '081234567891'), 'panggilan');
  assert.equal(b.cadangkan('p2', 'ip2', '081234567890'), null);
  assert.equal(b.cadangkan('p3', 'ip3', '081234567890'), 'nomor');
  assert.equal(b.cadangkan('p4', 'ip1', '081200000000'), null);
  assert.equal(b.cadangkan('p5', 'ip1', '081211111111'), 'ip');
  t = Date.parse('2026-10-20T00:00:01Z');
  assert.equal(b.cadangkan('p1', 'ip1', '081234567890'), null);
});

test('kuota tiket dipesan sebelum penerbitan dan dikembalikan bila gagal', () => {
  const b = new PembatasTiket({ perPanggilan: 1, perIpHarian: 5, perNomorHarian: 5 });
  assert.equal(b.cadangkan('p1', 'ip1', '081234567890'), null);
  // Giliran serentak kedua pada panggilan yang sama langsung ditolak, tanpa menunggu penerbitan pertama selesai.
  assert.equal(b.cadangkan('p1', 'ip1', '081234567890'), 'panggilan');
  b.batalkan('p1', 'ip1', '081234567890');
  assert.equal(b.cadangkan('p1', 'ip1', '081234567890'), null);
});

test('req_1_7 req_2_3 gateway produksi tanpa SUPABASE_URL atau SIGAP_KUNCI_INTERNAL berhenti saat start, bukan menerbitkan tiket tiruan', () => {
  const server = fileURLToPath(new URL('./server.mjs', import.meta.url));
  for (const sebagian of [{}, { SUPABASE_URL: 'http://127.0.0.1:54321' }, { SIGAP_KUNCI_INTERNAL: 'kunci-uji' }]) {
    const hasil = spawnSync(process.execPath, [server], { env: { NODE_ENV: 'production', PORT: '0', ...sebagian }, encoding: 'utf8', timeout: 5000 });
    assert.equal(hasil.status, 1, JSON.stringify(sebagian));
    assert.match(hasil.stderr, /env_supabase_kurang/);
  }
});
