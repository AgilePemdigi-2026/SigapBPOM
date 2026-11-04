import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TranskripController,
  PenyimpananTranskripMock,
  PenyimpananTranskripSupabase,
  samarkanNama,
  samarkanNamaDiTeks,
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

  // Tidak menyentuh teks bila nama tidak cocok atau kosong
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

  // Filter jenis interaksi
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

test('adapter Supabase membaca view riwayat_percakapan, ucapan_petugas, dan RPC ringkasan', async () => {
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

  const detail = await adapter.ambilDetail('mock-1');
  assert.ok(detail);
  assert.equal(detail.id, 'mock-1');
  assert.equal(panggilanTabel[0].table, 'riwayat_percakapan');
});
