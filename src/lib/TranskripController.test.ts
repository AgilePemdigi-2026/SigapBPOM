import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LABEL_STATUS_PENYELESAIAN, PESAN_RIWAYAT, TranskripController, UKURAN_HALAMAN, nomorHalaman, periodeBulanIni, type PercakapanTersimpan } from './TranskripController.ts';
import { PenyimpananRiwayatTiruan } from './mock/riwayatTiruan.ts';

// 4 Nov 2026 10.39 WIB.
const SEKARANG = new Date('2026-11-04T03:39:00Z');

const baris = (id: string, waktuMulai: string, lain: Partial<PercakapanTersimpan> = {}): PercakapanTersimpan => ({
  id,
  waktuMulai,
  jenisInteraksi: 'informasi_produk',
  ringkasan: `Percakapan ${id}`,
  statusPenyelesaian: 'selesai_ai',
  noTiket: null,
  noTelpTersamar: null,
  ...lain,
});

const DATA: PercakapanTersimpan[] = [
  baris('p-1', '2026-11-04T03:30:00Z', { ringkasan: 'Cek izin edar Susu Formula Sehat' }),
  baris('p-2', '2026-11-04T02:48:00Z', { statusPenyelesaian: 'dieskalasi', noTiket: 'ESK-20261104-0001', noTelpTersamar: '0821****0098' }),
  baris('p-3', '2026-11-03T02:12:00Z', { jenisInteraksi: 'pengaduan', statusPenyelesaian: 'tiket_terbit', noTiket: 'ADU-20261103-0001', noTelpTersamar: '0812****7890' }),
  baris('p-4', '2026-11-01T01:05:00Z', { jenisInteraksi: 'pengaduan', statusPenyelesaian: 'pengaduan_tidak_lengkap', ringkasan: null }),
  // Di luar periode bulan berjalan, dan percakapan yang masih berjalan.
  baris('p-5', '2026-10-31T16:59:00Z'),
  baris('p-6', '2026-11-04T03:38:00Z', { statusPenyelesaian: 'berjalan' }),
];

const controller = (data = DATA) => new TranskripController(new PenyimpananRiwayatTiruan(data));

test('req_5_1 t_f6_1_02 daftar percakapan memuat waktu, jenis, ringkasan, status, tiket, dan nomor tersamar sesuai data', async () => {
  const hasil = await controller().ambilDaftarPercakapan({}, SEKARANG);
  assert.ok('percakapan' in hasil);
  assert.deepEqual(hasil.percakapan, [
    { waktu: '04 Nov 10:30', jenis: 'Informasi Produk', ringkasan: 'Cek izin edar Susu Formula Sehat', labelStatus: 'Selesai oleh AI', noTiket: '—', noTelp: '—', tautanTranskrip: '/riwayat-percakapan/detail?id=p-1' },
    { waktu: '04 Nov 09:48', jenis: 'Informasi Produk', ringkasan: 'Percakapan p-2', labelStatus: 'Dieskalasi', noTiket: 'ESK-20261104-0001', noTelp: '0821****0098', tautanTranskrip: '/riwayat-percakapan/detail?id=p-2' },
    { waktu: '03 Nov 09:12', jenis: 'Pengaduan', ringkasan: 'Percakapan p-3', labelStatus: 'Tiket terbit', noTiket: 'ADU-20261103-0001', noTelp: '0812****7890', tautanTranskrip: '/riwayat-percakapan/detail?id=p-3' },
    { waktu: '01 Nov 08:05', jenis: 'Pengaduan', ringkasan: '—', labelStatus: 'Pengaduan tidak lengkap', noTiket: '—', noTelp: '—', tautanTranskrip: '/riwayat-percakapan/detail?id=p-4' },
  ]);
});

test('req_5_1 t_f6_1_02 kartu ringkasan periode menghitung total, informasi produk, pengaduan produk, dan dieskalasi bulan berjalan', async () => {
  const hasil = await controller().ambilDaftarPercakapan({}, SEKARANG);
  assert.ok('ringkasan' in hasil);
  assert.deepEqual(hasil.ringkasan, { total: 4, informasiProduk: 2, pengaduanProduk: 2, dieskalasi: 1 });
  assert.equal(hasil.labelPeriode, '1–4 Nov 2026');
});

test('req_5_1 status penyelesaian tampil dengan label baku PRD-rinci Bagian 9', async () => {
  assert.deepEqual(Object.values(LABEL_STATUS_PENYELESAIAN), ['Selesai oleh AI', 'Dieskalasi', 'Tiket terbit', 'Pengaduan tidak lengkap']);
  const data = Object.keys(LABEL_STATUS_PENYELESAIAN).map((s, i) => baris(`s-${i}`, `2026-11-02T0${i}:00:00Z`, { statusPenyelesaian: s }));
  const hasil = await controller(data).ambilDaftarPercakapan({}, SEKARANG);
  assert.ok('percakapan' in hasil);
  assert.deepEqual(hasil.percakapan.map((p) => p.labelStatus).sort(), Object.values(LABEL_STATUS_PENYELESAIAN).sort());
});

test('req_5_1 nfr_13 nomor telepon yang tidak tersamar tidak pernah diteruskan ke halaman', async () => {
  const hasil = await controller([baris('p-1', '2026-11-04T03:00:00Z', { noTelpTersamar: '081234567890' })]).ambilDaftarPercakapan({}, SEKARANG);
  assert.ok('percakapan' in hasil);
  assert.equal(hasil.percakapan[0].noTelp, '—');
});

test('req_5_1 t_f6_1_02 paginasi membagi daftar per halaman dan membawa nomor halaman tidak sah ke jangkauan', async () => {
  const banyak = Array.from({ length: UKURAN_HALAMAN * 2 + 3 }, (_, i) => baris(`p-${String(i).padStart(2, '0')}`, new Date(SEKARANG.getTime() - (i + 1) * 60_000).toISOString()));
  const c = controller(banyak);

  const kedua = await c.ambilDaftarPercakapan({ halaman: '2' }, SEKARANG);
  assert.ok('percakapan' in kedua);
  assert.deepEqual([kedua.halaman, kedua.jumlahHalaman, kedua.awal, kedua.akhir], [2, 3, UKURAN_HALAMAN + 1, UKURAN_HALAMAN * 2]);
  assert.equal(kedua.percakapan[0].tautanTranskrip, `/riwayat-percakapan/detail?id=p-${UKURAN_HALAMAN}`);

  const jauh = await c.ambilDaftarPercakapan({ halaman: '99' }, SEKARANG);
  assert.ok('percakapan' in jauh);
  assert.deepEqual([jauh.halaman, jauh.awal, jauh.akhir, jauh.percakapan.length], [3, UKURAN_HALAMAN * 2 + 1, UKURAN_HALAMAN * 2 + 3, 3]);

  for (const halaman of ['abc', '-1', '0', null]) {
    const h = await c.ambilDaftarPercakapan({ halaman }, SEKARANG);
    assert.ok('percakapan' in h);
    assert.equal(h.halaman, 1);
  }

  const kosong = await controller([]).ambilDaftarPercakapan({ halaman: '3' }, SEKARANG);
  assert.deepEqual(kosong, { labelPeriode: '1–4 Nov 2026', ringkasan: { total: 0, informasiProduk: 0, pengaduanProduk: 0, dieskalasi: 0 }, percakapan: [], halaman: 1, jumlahHalaman: 1, awal: 0, akhir: 0 });
});

test('req_5_1 periode dimulai awal bulan berjalan menurut WIB, bukan UTC', () => {
  // 31 Okt 18.00 UTC sudah 1 Nov 01.00 WIB.
  assert.deepEqual(periodeBulanIni(new Date('2026-10-31T18:00:00Z')), { dari: '2026-10-31T17:00:00.000Z', sampai: '2026-10-31T18:00:00.000Z' });
});

test('req_5_1 nomor halaman memuat halaman pertama, terakhir, dan tetangga halaman aktif', () => {
  assert.deepEqual(nomorHalaman(1, 1), [1]);
  assert.deepEqual(nomorHalaman(1, 148), [1, 2, null, 148]);
  assert.deepEqual(nomorHalaman(5, 148), [1, null, 4, 5, 6, null, 148]);
  assert.deepEqual(nomorHalaman(3, 4), [1, 2, 3, 4]);
});

test('req_5_1 penyimpanan gagal menampilkan pesan kamus, bukan detail teknis', async () => {
  const c = new TranskripController({
    daftar: async () => [],
    ringkasan: async () => {
      throw new Error('Supabase 500 pada riwayat_percakapan');
    },
  });
  assert.deepEqual(await c.ambilDaftarPercakapan({}, SEKARANG), { gagal: PESAN_RIWAYAT.gagalDimuat });
});
