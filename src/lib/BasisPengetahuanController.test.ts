import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BasisPengetahuanController,
  PESAN_MATERI,
} from './BasisPengetahuanController.ts';
import { PenyimpananMateriTiruan } from './mock/materiTiruan.ts';
import { POST as apiNonaktifkan } from '../pages/api/materi/[id]/nonaktifkan.ts';

const PETUGAS = {
  id: 'a0000000-0000-4000-8000-000000000001',
  nama: 'Dewi Lestari',
  email: 'dewi.lestari@pom.go.id',
};

test('req_7_3 menonaktifkan materi mengubah status menjadi tidak_aktif dan mencatat petugas serta waktu (BR-5)', async () => {
  const penyimpanan = new PenyimpananMateriTiruan();
  penyimpanan.tambahMateri({
    id: 'mat-001',
    judul: 'Pedoman Registrasi Obat',
    rujukanSumber: 'Peraturan BPOM Nomor 24 Tahun 2024',
    status: 'aktif',
  });

  const controller = new BasisPengetahuanController(penyimpanan);
  const hasil = await controller.nonaktifkanMateri('mat-001', PETUGAS.id);

  assert.equal(hasil.berhasil, true);
  assert.equal(hasil.pesan, PESAN_MATERI.dinonaktifkan);

  // Status materi menjadi tidak aktif dan tidak dihapus (BR-5)
  assert.equal(penyimpanan.apakahNonaktif('mat-001'), true);

  const pembaruan = await penyimpanan.ambilPembaruan('mat-001');
  assert.ok(pembaruan);
  assert.equal(pembaruan.status, 'tidak_aktif');
  assert.equal(pembaruan.diperbaruiOleh, PETUGAS.id);
  assert.ok(pembaruan.diperbaruiPada instanceof Date);
});

test('req_7_3 materi usang yang dinonaktifkan dikeluarkan dari hasil pencarian RAG', async () => {
  const penyimpanan = new PenyimpananMateriTiruan();

  // Materi 1: Aktif
  penyimpanan.tambahMateri({
    id: 'mat-001',
    judul: 'Regulasi Pangan Olahan',
    rujukanSumber: 'Peraturan BPOM Nomor 10 Tahun 2024',
    status: 'aktif',
    potongan: [
      { id: 'pot-001', teks: 'Ketentuan batas cemaran mikroba pada susu formula.', embedding: [1, 0, 0] },
    ],
  });

  // Materi 2: Aktif yang nanti akan dinonaktifkan
  penyimpanan.tambahMateri({
    id: 'mat-002',
    judul: 'Regulasi Kedaluwarsa Lama',
    rujukanSumber: 'Peraturan BPOM Nomor 5 Tahun 2018',
    status: 'aktif',
    potongan: [
      { id: 'pot-002', teks: 'Ketentuan kedaluwarsa produk pangan lama yang sudah dicabut.', embedding: [0.9, 0.1, 0] },
    ],
  });

  const controller = new BasisPengetahuanController(penyimpanan);

  // Sebelum nonaktif: kedua materi muncul pada pencarian RAG
  const hasilSebelum = await controller.cariPotongan([1, 0, 0], 0.5, 5);
  assert.equal(hasilSebelum.length, 2);
  assert.ok(hasilSebelum.some((p) => p.materiId === 'mat-001'));
  assert.ok(hasilSebelum.some((p) => p.materiId === 'mat-002'));

  // Nonaktifkan Materi 2
  const hasilNonaktif = await controller.nonaktifkanMateri('mat-002', PETUGAS.id);
  assert.equal(hasilNonaktif.berhasil, true);

  // Setelah dinonaktifkan: Materi 2 TIDAK PERNAH muncul di hasil pencarian RAG
  const hasilSesudah = await controller.cariPotongan([1, 0, 0], 0.5, 5);
  assert.equal(hasilSesudah.length, 1);
  assert.equal(hasilSesudah[0].materiId, 'mat-001');
  assert.equal(hasilSesudah[0].id, 'pot-001');
  assert.equal(hasilSesudah.some((p) => p.materiId === 'mat-002'), false);
});

test('req_7_3 validasi ID materi kosong atau tidak ditemukan', async () => {
  const penyimpanan = new PenyimpananMateriTiruan();
  const controller = new BasisPengetahuanController(penyimpanan);

  const hasilKosong = await controller.nonaktifkanMateri('', PETUGAS.id);
  assert.deepEqual(hasilKosong, { berhasil: false, pesan: PESAN_MATERI.tidakDitemukan });

  const hasilSpasi = await controller.nonaktifkanMateri('   ', PETUGAS.id);
  assert.deepEqual(hasilSpasi, { berhasil: false, pesan: PESAN_MATERI.tidakDitemukan });
});

test('req_7_3 penonaktifan tanpa sesi petugas ditolak', async () => {
  const penyimpanan = new PenyimpananMateriTiruan();
  const controller = new BasisPengetahuanController(penyimpanan);

  const hasilTanpaPetugas = await controller.nonaktifkanMateri('mat-001', '');
  assert.deepEqual(hasilTanpaPetugas, { berhasil: false, pesan: 'Akses ditolak.' });
});

test('req_7_3 boundary API route /api/materi/[id]/nonaktifkan memeriksa sesi petugas', async () => {
  const penyimpanan = new PenyimpananMateriTiruan();
  const controller = new BasisPengetahuanController(penyimpanan);

  // Tanpa sesi petugas -> 401 Akses ditolak
  const resTanpaSesi = await apiNonaktifkan({
    params: { id: '1' },
    locals: { autentikasi: {} as any, basisPengetahuan: controller },
  } as any);

  assert.equal(resTanpaSesi.status, 401);
  const dataTanpaSesi = await resTanpaSesi.json();
  assert.deepEqual(dataTanpaSesi, { status: 'error', message: 'Akses ditolak.', data: null });

  // Dengan sesi petugas -> 200 Materi ditandai tidak aktif.
  const resDenganSesi = await apiNonaktifkan({
    params: { id: '1' },
    locals: { autentikasi: {} as any, petugas: PETUGAS, basisPengetahuan: controller },
  } as any);

  assert.equal(resDenganSesi.status, 200);
  const dataDenganSesi = await resDenganSesi.json();
  assert.deepEqual(dataDenganSesi, { status: 'success', message: PESAN_MATERI.dinonaktifkan, data: null });
  assert.equal(penyimpanan.apakahNonaktif('1'), true);
});

test('br_5 migrasi sql cari_potongan menyaring mk.status = aktif', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase', 'migrations', '20261029132800_cari_potongan.sql'),
    'utf8',
  );

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cari_potongan/);
  assert.match(sql, /WHERE mk\.status = 'aktif'/);
});
