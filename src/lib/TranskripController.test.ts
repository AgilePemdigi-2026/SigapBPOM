import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TranskripController,
  PenyimpananTranskripMock,
  PenyimpananTranskripSupabase,
  samarkanNama,
  samarkanNamaDiTeks,
  PESAN_CATATAN_TERSIMPAN,
  PESAN_CATATAN_WAJIB_DIISI,
} from './TranskripController.ts';

test('nfr_13 samarkanNama menyamarkan nama pelapor per kata sesuai format B*** S******', () => {
  assert.equal(samarkanNama('Budi Santoso'), 'B*** S******');
  assert.equal(samarkanNama('Siti'), 'S***');
  assert.equal(samarkanNama('Ahmad Dahlan Kusuma'), 'A**** D***** K*****');
  assert.equal(samarkanNama(''), null);
  assert.equal(samarkanNama(null), null);
  assert.equal(samarkanNama(undefined), null);
});

test('nfr_13 samarkanNamaDiTeks menyamarkan kemunculan nama pelapor dan kata bagiannya di teks', () => {
  const teks1 = 'Nama saya Budi Santoso, nomor saya 0812****7890 mau mengadukan produk.';
  const hasil1 = samarkanNamaDiTeks(teks1, 'Budi Santoso');
  assert.equal(hasil1, 'Nama saya B*** S******, nomor saya 0812****7890 mau mengadukan produk.');

  const teks2 = 'Terima kasih Bapak Budi, laporan sudah tercatat.';
  const hasil2 = samarkanNamaDiTeks(teks2, 'Budi Santoso');
  assert.equal(hasil2, 'Terima kasih Bapak B***, laporan sudah tercatat.');

  assert.equal(samarkanNamaDiTeks('Halo halo bandung', 'Budi'), 'Halo halo bandung');
  assert.equal(samarkanNamaDiTeks('Halo halo bandung', null), 'Halo halo bandung');
});

test('req_5_1 riwayat percakapan mengembalikan daftar percakapan dengan nomor tersamar', async () => {
  const mockStorage = new PenyimpananTranskripMock();
  const controller = new TranskripController(mockStorage);

  const riwayat = await controller.ambilRiwayat();
  assert.equal(riwayat.length, 3);
  assert.equal(riwayat[0].noTelpTersamar, '0812****7890');
  assert.equal(riwayat[1].jenisInteraksi, 'pengaduan');
  assert.equal(riwayat[1].noTiket, 'ADU-20261104-0001');

  const hanyaPengaduan = await controller.ambilRiwayat({ jenis: 'pengaduan' });
  assert.equal(hanyaPengaduan.length, 1);
  assert.equal(hanyaPengaduan[0].id, '88888888-0000-0000-0000-000000000002');
});

test('req_5_1 ringkasan periode menghitung metrik statistik untuk kartu di atas daftar', async () => {
  const mockStorage = new PenyimpananTranskripMock();
  const controller = new TranskripController(mockStorage);

  const ringkasan = await controller.ambilRingkasanPeriode();
  assert.equal(ringkasan.totalPercakapan, 3);
  assert.equal(ringkasan.informasiProduk, 2);
  assert.equal(ringkasan.pengaduanProduk, 1);
  assert.equal(ringkasan.dieskalasi, 1);
});

test('req_5_2 detail transkrip mengembalikan giliran ucapan lengkap dengan penyamaran data pribadi', async () => {
  const mockStorage = new PenyimpananTranskripMock();
  const controller = new TranskripController(mockStorage);

  const detail = await controller.ambilDetailTranskrip('88888888-0000-0000-0000-000000000002');
  assert.ok(detail);
  assert.equal(detail.percakapan.noTiket, 'ADU-20261104-0001');
  assert.equal(detail.ucapan.length, 3);
  assert.equal(detail.ucapan[0].pembicara, 'sistem');
  assert.equal(detail.ucapan[1].pembicara, 'penelepon');
  assert.ok(detail.ucapan[1].teks.includes('B*** S******'));
  assert.ok(detail.ucapan[1].teks.includes('0812****7890'));
  assert.equal(detail.ucapan[1].teks.includes('Budi Santoso'), false);
  assert.equal(detail.ucapan[1].teks.includes('081234567890'), false);
});

test('req_5_2 ambilTranskrip melempar galat bila id percakapan kosong atau tidak valid', async () => {
  const mockStorage = new PenyimpananTranskripMock();
  const controller = new TranskripController(mockStorage);

  await assert.rejects(() => controller.ambilTranskrip(''), /ID percakapan tidak valid/);
  await assert.rejects(() => controller.ambilDetailTranskrip(''), /ID percakapan tidak valid/);
});

test('req_5_4 validasi catatan kosong ditolak dengan pesan kamus Lampiran A', async () => {
  const mockStorage = new PenyimpananTranskripMock();
  const controller = new TranskripController(mockStorage);

  await assert.rejects(
    () => controller.simpanCatatanPemeriksaan('88888888-0000-0000-0000-000000000002', ''),
    (e: Error) => e.message === PESAN_CATATAN_WAJIB_DIISI
  );

  await assert.rejects(
    () => controller.simpanCatatanPemeriksaan('88888888-0000-0000-0000-000000000002', '   '),
    (e: Error) => e.message === PESAN_CATATAN_WAJIB_DIISI
  );

  await assert.rejects(
    () => controller.simpanCatatanPemeriksaan('', 'Catatan uji'),
    (e: Error) => e.message.includes('ID percakapan tidak valid')
  );
});

test('req_5_3 penyimpanan catatan pemeriksaan berhasil dan tersimpan pada percakapan terkait', async () => {
  const mockStorage = new PenyimpananTranskripMock();
  const controller = new TranskripController(mockStorage);

  const hasil = await controller.simpanCatatanPemeriksaan(
    '88888888-0000-0000-0000-000000000002',
    'Perlu verifikasi ulang data pelapor.'
  );

  assert.ok(hasil.id);
  assert.equal(hasil.pesan, PESAN_CATATAN_TERSIMPAN);

  const daftarCatatan = await controller.ambilCatatanPemeriksaan('88888888-0000-0000-0000-000000000002');
  assert.equal(daftarCatatan.length, 1);
  assert.equal(daftarCatatan[0].isi, 'Perlu verifikasi ulang data pelapor.');

  // Detail transkrip sekarang juga memuat catatan yang baru disimpan
  const detail = await controller.ambilDetailTranskrip('88888888-0000-0000-0000-000000000002');
  assert.ok(detail?.catatanPemeriksaan);
  assert.equal(detail.catatanPemeriksaan.length, 1);
  assert.equal(detail.catatanPemeriksaan[0].isi, 'Perlu verifikasi ulang data pelapor.');
});

test('adapter Supabase membaca view riwayat_percakapan, ucapan_petugas, dan RPC catatan', async () => {
  const panggilanRpc: { fn: string; params: unknown }[] = [];
  const panggilanTabel: { table: string; select: string }[] = [];

  const mockSupabase = {
    from(table: string) {
      return {
        select(cols: string) {
          panggilanTabel.push({ table, select: cols });
          return {
            eq(col: string, val: unknown) {
              return {
                order(orderCol: string, opts?: { ascending?: boolean }) {
                  return Promise.resolve({
                    data: [
                      {
                        id: 'mock-1',
                        percakapanId: 'mock-1',
                        waktuMulai: '2026-11-04T10:00:00Z',
                        waktuSelesai: null,
                        jenisInteraksi: 'pengaduan',
                        ringkasan: 'Test',
                        statusPenyelesaian: 'tiket_terbit',
                        noTiket: 'ADU-20261104-0001',
                        noTelp: '0812****7890',
                        noTelpTersamar: '0812****7890',
                      },
                    ],
                    error: null,
                  });
                },
              };
            },
            order(col: string, opts?: { ascending?: boolean }) {
              return Promise.resolve({
                data: [],
                error: null,
              });
            },
          };
        },
      };
    },
    rpc(fn: string, params?: Record<string, unknown>) {
      panggilanRpc.push({ fn, params });
      if (fn === 'simpan_catatan_pemeriksaan') {
        return Promise.resolve({
          data: 'uuid-catatan-1',
          error: null,
        });
      }
      if (fn === 'ambil_catatan_pemeriksaan') {
        return Promise.resolve({
          data: [
            {
              id: 'uuid-catatan-1',
              percakapan_id: 'mock-1',
              petugas_id: 'petugas-1',
              petugas_nama: 'Petugas Uji',
              isi: 'Catatan tes',
              waktu: '2026-11-04T10:00:00Z',
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({
        data: {
          total_percakapan: 10,
          informasi_produk: 7,
          pengaduan_produk: 3,
          dieskalasi: 2,
        },
        error: null,
      });
    },
  };

  const adapter = new PenyimpananTranskripSupabase(mockSupabase);
  const ringkasan = await adapter.ambilRingkasanPeriode({ awal: '2026-11-01', akhir: '2026-11-04' });
  assert.equal(ringkasan.totalPercakapan, 10);
  assert.equal(ringkasan.informasiProduk, 7);
  assert.equal(panggilanRpc[0].fn, 'ambil_ringkasan_periode_percakapan');

  const simpan = await adapter.simpanCatatan('mock-1', 'Catatan penting');
  assert.equal(simpan.id, 'uuid-catatan-1');
  assert.equal(simpan.pesan, PESAN_CATATAN_TERSIMPAN);
  assert.equal(panggilanRpc[1].fn, 'simpan_catatan_pemeriksaan');

  const catatan = await adapter.ambilCatatan('mock-1');
  assert.equal(catatan.length, 1);
  assert.equal(panggilanRpc[2].fn, 'ambil_catatan_pemeriksaan');
});
