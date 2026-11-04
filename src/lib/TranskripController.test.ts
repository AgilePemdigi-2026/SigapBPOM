import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JUMLAH_BULAN_PILIHAN, LABEL_STATUS_PENYELESAIAN, PESAN_RIWAYAT, TranskripController, UKURAN_HALAMAN, daftarPeriode, nomorHalaman, type PercakapanTersimpan } from './TranskripController.ts';
import { PenyimpananRiwayatTiruan } from './mock/riwayatTiruan.ts';

// 4 Nov 2026 10.39 WIB.
const SEKARANG = new Date('2026-11-04T03:39:00Z');

const baris = (id: string, waktuMulai: string, lain: Partial<PercakapanTersimpan> = {}): PercakapanTersimpan => ({
  id,
  waktuMulai,
  jenisInteraksi: 'informasi_produk',
  ringkasan: `Percakapan ${id}`,
  statusPenyelesaian: 'selesai_ai',
  ...lain,
});

const DATA: PercakapanTersimpan[] = [
  baris('p-1', '2026-11-04T03:30:00Z', { ringkasan: 'Cek izin edar Susu Formula Sehat' }),
  baris('p-2', '2026-11-04T02:48:00Z', { statusPenyelesaian: 'dieskalasi' }),
  baris('p-3', '2026-11-03T02:12:00Z', { jenisInteraksi: 'pengaduan', statusPenyelesaian: 'tiket_terbit' }),
  baris('p-4', '2026-11-01T01:05:00Z', { jenisInteraksi: 'pengaduan', statusPenyelesaian: 'pengaduan_tidak_lengkap', ringkasan: null }),
  // Di luar periode bulan berjalan, dan percakapan yang masih berjalan.
  baris('p-5', '2026-10-31T16:59:00Z'),
  baris('p-6', '2026-11-04T03:38:00Z', { statusPenyelesaian: 'berjalan' }),
];

const controller = (data = DATA) => new TranskripController(new PenyimpananRiwayatTiruan(data));

test('req_5_1 t_f6_1_02 daftar percakapan memuat waktu, jenis, ringkasan, dan status penyelesaian sesuai data', async () => {
  const hasil = await controller().ambilDaftarPercakapan({}, SEKARANG);
  assert.ok('percakapan' in hasil);
  assert.deepEqual(hasil.percakapan, [
    { waktu: '04 Nov · 10:30', jenis: 'Informasi Produk', ringkasan: 'Cek izin edar Susu Formula Sehat', labelStatus: 'selesai oleh AI', tautanTranskrip: '/riwayat-percakapan/detail?id=p-1' },
    { waktu: '04 Nov · 09:48', jenis: 'Informasi Produk', ringkasan: 'Percakapan p-2', labelStatus: 'dieskalasi', tautanTranskrip: '/riwayat-percakapan/detail?id=p-2' },
    { waktu: '03 Nov · 09:12', jenis: 'Pengaduan', ringkasan: 'Percakapan p-3', labelStatus: 'tiket terbit', tautanTranskrip: '/riwayat-percakapan/detail?id=p-3' },
    { waktu: '01 Nov · 08:05', jenis: 'Pengaduan', ringkasan: '—', labelStatus: 'pengaduan tidak lengkap', tautanTranskrip: '/riwayat-percakapan/detail?id=p-4' },
  ]);
});

test('req_5_1 t_f6_1_02 kartu ringkasan periode menghitung total, informasi produk, pengaduan produk, dan dieskalasi bulan berjalan', async () => {
  const hasil = await controller().ambilDaftarPercakapan({}, SEKARANG);
  assert.ok('ringkasan' in hasil);
  assert.deepEqual(hasil.ringkasan, { total: 4, informasiProduk: 2, pengaduanProduk: 2, dieskalasi: 1 });
  assert.deepEqual([hasil.periode.nilai, hasil.periode.label, hasil.periode.labelPendek], ['2026-11', '1–4 November 2026', '1–4 Nov 2026']);
});

test('req_5_1 status penyelesaian tampil dengan label baku PRD-rinci Bagian 9', async () => {
  assert.deepEqual(Object.values(LABEL_STATUS_PENYELESAIAN), ['selesai oleh AI', 'dieskalasi', 'tiket terbit', 'pengaduan tidak lengkap', 'terputus']);
  const data = Object.keys(LABEL_STATUS_PENYELESAIAN).map((s, i) => baris(`s-${i}`, `2026-11-02T0${i}:00:00Z`, { statusPenyelesaian: s }));
  const hasil = await controller(data).ambilDaftarPercakapan({}, SEKARANG);
  assert.ok('percakapan' in hasil);
  assert.deepEqual(hasil.percakapan.map((p) => p.labelStatus).sort(), Object.values(LABEL_STATUS_PENYELESAIAN).sort());
});

test('req_5_1 saringan jenis membatasi daftar dan paginasi, sedangkan kartu ringkasan tetap untuk seluruh periode', async () => {
  const pengaduan = await controller().ambilDaftarPercakapan({ jenis: 'pengaduan' }, SEKARANG);
  assert.ok('percakapan' in pengaduan);
  assert.equal(pengaduan.jenis, 'pengaduan');
  assert.deepEqual(pengaduan.percakapan.map((p) => p.jenis), ['Pengaduan', 'Pengaduan']);
  assert.equal(pengaduan.jumlah, 2);
  assert.deepEqual(pengaduan.ringkasan, { total: 4, informasiProduk: 2, pengaduanProduk: 2, dieskalasi: 1 });

  const asing = await controller().ambilDaftarPercakapan({ jenis: 'apa_saja' }, SEKARANG);
  assert.ok('percakapan' in asing);
  assert.deepEqual([asing.jenis, asing.jumlah], ['', 4]);
});

test('req_5_1 periode bulan lalu memakai bulan penuh; periode di luar pilihan kembali ke bulan berjalan', async () => {
  const data = [baris('okt', '2026-10-31T16:59:00Z'), baris('nov', '2026-11-02T00:00:00Z')];
  const oktober = await controller(data).ambilDaftarPercakapan({ periode: '2026-10' }, SEKARANG);
  assert.ok('percakapan' in oktober);
  assert.deepEqual([oktober.periode.label, oktober.ringkasan.total, oktober.percakapan[0].tautanTranskrip], ['1–31 Oktober 2026', 1, '/riwayat-percakapan/detail?id=okt']);

  for (const periode of ['2025-11', '2026-12', 'x']) {
    const h = await controller(data).ambilDaftarPercakapan({ periode }, SEKARANG);
    assert.ok('percakapan' in h);
    assert.equal(h.periode.nilai, '2026-11');
  }
});

test('req_5_1 t_f6_1_02 paginasi membagi daftar per halaman dan membawa nomor halaman tidak sah ke jangkauan', async () => {
  const banyak = Array.from({ length: UKURAN_HALAMAN * 2 + 3 }, (_, i) => baris(`p-${String(i).padStart(2, '0')}`, new Date(SEKARANG.getTime() - (i + 1) * 60_000).toISOString()));
  const c = controller(banyak);

  const kedua = await c.ambilDaftarPercakapan({ halaman: '2' }, SEKARANG);
  assert.ok('percakapan' in kedua);
  assert.deepEqual([kedua.halaman, kedua.jumlahHalaman, kedua.awal, kedua.akhir], [2, 3, UKURAN_HALAMAN + 1, UKURAN_HALAMAN * 2]);
  assert.equal(kedua.percakapan[0].tautanTranskrip, `/riwayat-percakapan/detail?id=p-${String(UKURAN_HALAMAN).padStart(2, '0')}`);

  const jauh = await c.ambilDaftarPercakapan({ halaman: '99' }, SEKARANG);
  assert.ok('percakapan' in jauh);
  assert.deepEqual([jauh.halaman, jauh.awal, jauh.akhir, jauh.percakapan.length], [3, UKURAN_HALAMAN * 2 + 1, UKURAN_HALAMAN * 2 + 3, 3]);

  for (const halaman of ['abc', '-1', '0', null]) {
    const h = await c.ambilDaftarPercakapan({ halaman }, SEKARANG);
    assert.ok('percakapan' in h);
    assert.equal(h.halaman, 1);
  }

  const kosong = await controller([]).ambilDaftarPercakapan({ halaman: '3' }, SEKARANG);
  assert.ok('percakapan' in kosong);
  assert.deepEqual([kosong.percakapan, kosong.jumlah, kosong.halaman, kosong.jumlahHalaman, kosong.awal, kosong.akhir], [[], 0, 1, 1, 0, 0]);
});

test('req_5_1 pilihan periode per bulan dimulai awal bulan menurut WIB, bukan UTC', () => {
  // 31 Okt 18.00 UTC sudah 1 Nov 01.00 WIB.
  const sekarang = new Date('2026-10-31T18:00:00Z');
  const [ini, lalu] = daftarPeriode(sekarang);
  assert.deepEqual(ini, { nilai: '2026-11', label: '1–1 November 2026', labelPendek: '1–1 Nov 2026', periode: { dari: '2026-10-31T17:00:00.000Z', sampai: '2026-10-31T18:00:00.000Z' } });
  assert.deepEqual(lalu.periode, { dari: '2026-09-30T17:00:00.000Z', sampai: '2026-10-31T17:00:00.000Z' });
  const semua = daftarPeriode(SEKARANG);
  assert.equal(semua.length, JUMLAH_BULAN_PILIHAN);
  assert.deepEqual([semua[2].nilai, semua[11].nilai, semua[11].label], ['2026-09', '2025-12', '1–31 Desember 2025']);
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
