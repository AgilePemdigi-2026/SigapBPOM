import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ErrorSigapPengaduan,
  PengaduanController,
  PESAN_MINTA_NOMOR_TELEPON,
  PESAN_PENGADUAN_TIDAK_LENGKAP,
  type PenyimpananPengaduan,
} from './PengaduanController.ts';

const PERCAKAPAN = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function penyimpananPengaduanTiruan() {
  const dataPengaduan: {
    percakapanId: string;
    namaProduk?: string;
    kronologi?: string;
    namaPelapor?: string;
    nomorTelepon?: string;
    ringkasan?: string;
  }[] = [];
  const p: PenyimpananPengaduan = {
    async terbitkanTiketPengaduan(d) {
      dataPengaduan.push(d);
      return 'ADU-20261101-0001';
    },
    async simpanPengaduanTidakLengkap(d) {
      dataPengaduan.push(d);
      return '9f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
    },
  };
  return { p, dataPengaduan };
}

test('br_1 penerbitan tiket pengaduan berhasil saat data lengkap', async () => {
  const { p, dataPengaduan } = penyimpananPengaduanTiruan();
  const c = new PengaduanController(p);

  const res = await c.terbitkanTiketPengaduan({
    percakapanId: PERCAKAPAN,
    namaProduk: 'Sirup Batuk Sehat',
    kronologi: 'Anak mengalami demam dan ruam setelah meminum obat',
    namaPelapor: 'Ahmad Fauzi',
    nomorTelepon: '081234567890',
  });

  assert.equal(res.nomorTiket, 'ADU-20261101-0001');
  assert.equal(dataPengaduan.length, 1);
  assert.equal(dataPengaduan[0].namaProduk, 'Sirup Batuk Sehat');
  assert.equal(dataPengaduan[0].namaPelapor, 'Ahmad Fauzi');
  assert.equal(dataPengaduan[0].nomorTelepon, '081234567890');
});

test('br_1 nama produk kosong ditolak dengan kode 422', async () => {
  const { p } = penyimpananPengaduanTiruan();
  const c = new PengaduanController(p);

  await assert.rejects(
    () =>
      c.terbitkanTiketPengaduan({
        percakapanId: PERCAKAPAN,
        namaProduk: '   ',
        kronologi: 'Reaksi obat',
        namaPelapor: 'Ahmad',
        nomorTelepon: '081234567890',
      }),
    (err: ErrorSigapPengaduan) => err.status === 422 && err.message === 'Nama produk wajib diisi.'
  );
});

test('br_1 kronologi kosong ditolak dengan kode 422', async () => {
  const { p } = penyimpananPengaduanTiruan();
  const c = new PengaduanController(p);

  await assert.rejects(
    () =>
      c.terbitkanTiketPengaduan({
        percakapanId: PERCAKAPAN,
        namaProduk: 'Sirup Sehat',
        kronologi: '',
        namaPelapor: 'Ahmad',
        nomorTelepon: '081234567890',
      }),
    (err: ErrorSigapPengaduan) => err.status === 422 && err.message === 'Kronologi kejadian wajib diisi.'
  );
});

test('br_1 nama pelapor kosong ditolak dengan kode 422', async () => {
  const { p } = penyimpananPengaduanTiruan();
  const c = new PengaduanController(p);

  await assert.rejects(
    () =>
      c.terbitkanTiketPengaduan({
        percakapanId: PERCAKAPAN,
        namaProduk: 'Sirup Sehat',
        kronologi: 'Reaksi alergi',
        namaPelapor: '   ',
        nomorTelepon: '081234567890',
      }),
    (err: ErrorSigapPengaduan) => err.status === 422 && err.message === 'Nama pelapor wajib diisi.'
  );
});

test('br_1 nomor telepon tidak valid ditolak dengan pesan minta nomor telepon', async () => {
  const { p } = penyimpananPengaduanTiruan();
  const c = new PengaduanController(p);

  for (const telp of ['12345', '02112345678', 'bukan_nomor']) {
    await assert.rejects(
      () =>
        c.terbitkanTiketPengaduan({
          percakapanId: PERCAKAPAN,
          namaProduk: 'Sirup Sehat',
          kronologi: 'Reaksi alergi',
          namaPelapor: 'Ahmad',
          nomorTelepon: telp,
        }),
      (err: ErrorSigapPengaduan) => err.status === 422 && err.message === PESAN_MINTA_NOMOR_TELEPON
    );
  }
});

test('req_2_3 percakapanId tidak valid ditolak dengan kode 422', async () => {
  const { p } = penyimpananPengaduanTiruan();
  const c = new PengaduanController(p);

  await assert.rejects(
    () =>
      c.terbitkanTiketPengaduan({
        percakapanId: 'bukan-uuid',
        namaProduk: 'Sirup Sehat',
        kronologi: 'Reaksi alergi',
        namaPelapor: 'Ahmad',
        nomorTelepon: '081234567890',
      }),
    (err: ErrorSigapPengaduan) => err.status === 422 && err.message === 'Percakapan tidak valid.'
  );
});

test('req_2_5 pesan pengaduan tidak lengkap sama persis dengan kamus PRD Lampiran A', () => {
  assert.equal(
    PESAN_PENGADUAN_TIDAK_LENGKAP,
    'Panggilan berakhir. Pengaduan belum lengkap sehingga nomor tiket tidak diterbitkan.'
  );
});

test('req_2_5 simpan pengaduan tidak lengkap berhasil menyimpan data sebagian tanpa tiket', async () => {
  const { p, dataPengaduan } = penyimpananPengaduanTiruan();
  const c = new PengaduanController(p);

  const res = await c.simpanPengaduanTidakLengkap({
    percakapanId: PERCAKAPAN,
    namaProduk: 'Kapsul Pelangsing',
    namaPelapor: 'Dewi',
  });

  assert.equal(res.status, 'pengaduan_tidak_lengkap');
  assert.equal(res.id, '9f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b');
  assert.equal(dataPengaduan.length, 1);
  assert.equal(dataPengaduan[0].namaProduk, 'Kapsul Pelangsing');
  assert.equal(dataPengaduan[0].namaPelapor, 'Dewi');
  assert.equal(dataPengaduan[0].kronologi, undefined);
  assert.equal(dataPengaduan[0].nomorTelepon, undefined);
});

test('req_2_5 simpan pengaduan tidak lengkap menolak percakapanId tidak valid', async () => {
  const { p } = penyimpananPengaduanTiruan();
  const c = new PengaduanController(p);

  await assert.rejects(
    () =>
      c.simpanPengaduanTidakLengkap({
        percakapanId: 'invalid-id',
        namaProduk: 'Kapsul Pelangsing',
      }),
    (err: ErrorSigapPengaduan) => err.status === 422 && err.message === 'Percakapan tidak valid.'
  );
});
