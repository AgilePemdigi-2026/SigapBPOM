import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JENIS_INTERAKSI, PengaduanController } from './pengaduan.mjs';
import { PESAN_LAYANAN_1, PESAN_LAYANAN_2, RiwayatPanggilan, pilihMenu } from './percakapan.mjs';

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

test('req_2_1 pilihan 2 menandai percakapan pengaduan dan memutar prompt data pengaduan', () => {
  const riwayat = new RiwayatPanggilan();
  const pengaduan = new PengaduanController();
  const hasil = pilihMenu(riwayat, pengaduan, ID, 2);
  assert.equal(hasil.jawaban, 'Silakan sebutkan nama produk, kronologi kejadian, nama, dan nomor telepon Anda.');
  assert.equal(hasil.jawaban, PESAN_LAYANAN_2);
  assert.equal(hasil.suara, '/voice/statis/layanan-2');
  assert.equal(riwayat.jenisInteraksi(ID), JENIS_INTERAKSI.PENGADUAN);
  assert.equal(riwayat.layanan(ID), 2);
  assert.ok(pengaduan.aktif(ID));
});

test('req_1_1 pilihan 1 tetap alur UC-01 dan tidak memulai pengaduan', () => {
  const riwayat = new RiwayatPanggilan();
  const pengaduan = new PengaduanController();
  const hasil = pilihMenu(riwayat, pengaduan, ID, 1);
  assert.equal(hasil.jawaban, PESAN_LAYANAN_1);
  assert.equal(hasil.suara, '/voice/statis/layanan-1');
  assert.equal(riwayat.jenisInteraksi(ID), JENIS_INTERAKSI.INFORMASI_PRODUK);
  assert.ok(!pengaduan.aktif(ID));
});

test('req_2_1 pindah dari pengaduan ke informasi produk membuang alur pengaduan', () => {
  const riwayat = new RiwayatPanggilan();
  const pengaduan = new PengaduanController();
  pilihMenu(riwayat, pengaduan, ID, 2);
  pilihMenu(riwayat, pengaduan, ID, 1);
  assert.ok(!pengaduan.aktif(ID));
  assert.equal(riwayat.jenisInteraksi(ID), JENIS_INTERAKSI.INFORMASI_PRODUK);
});

test('req_2_1 pilihan tidak dikenal ditolak tanpa mengubah percakapan', () => {
  const riwayat = new RiwayatPanggilan();
  const pengaduan = new PengaduanController();
  for (const n of [0, 3, NaN, undefined]) assert.equal(pilihMenu(riwayat, pengaduan, ID, n), null);
  assert.equal(riwayat.jenisInteraksi(ID), null);
  assert.ok(!pengaduan.aktif(ID));
});
