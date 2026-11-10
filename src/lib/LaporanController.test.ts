import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LaporanController,
  PenyimpananLaporanMock,
  PenyimpananLaporanSupabase,
  PESAN_LAPORAN,
  daftarPeriode,
} from './LaporanController.ts';

test('daftarPeriode menghasilkan daftar bulan dari tanggal acuan hingga Januari 2025', () => {
  const tglAcuan = new Date('2026-11-05T10:00:00+07:00');
  const daftar = daftarPeriode(tglAcuan);

  assert.ok(daftar.length > 0);
  // Elemen pertama adalah November 2026
  assert.equal(daftar[0].nilai, '2026-11');
  assert.equal(daftar[0].label, '01-11-2026 s.d. 30-11-2026');
  assert.equal(daftar[0].awal, '2026-11-01');
  assert.equal(daftar[0].akhir, '2026-11-30');

  // Elemen terakhir adalah Januari 2025
  const terakhir = daftar[daftar.length - 1];
  assert.equal(terakhir.nilai, '2025-01');
  assert.equal(terakhir.label, '01-01-2025 s.d. 31-01-2025');
  assert.equal(terakhir.awal, '2025-01-01');
  assert.equal(terakhir.akhir, '2025-01-31');

  // Cek Februari 2025 (bukan kabisat -> 28 hari)
  const feb2025 = daftar.find((p) => p.nilai === '2025-02');
  assert.ok(feb2025);
  assert.equal(feb2025.akhir, '2025-02-28');
  assert.equal(feb2025.label, '01-02-2025 s.d. 28-02-2025');
});

test('req_8_1 hitungRekap mengembalikan rekap total dan rincian mingguan saat data tersedia', async () => {
  const mockStorage = new PenyimpananLaporanMock();
  const controller = new LaporanController(mockStorage);

  const hasil = await controller.hitungRekap({ awal: '2026-09-01', akhir: '2026-09-30' });

  assert.ok('total' in hasil);
  assert.equal(hasil.total.panggilan, 2148);
  assert.equal(hasil.total.tereskalasi, 163);
  assert.equal(hasil.total.pengaduanSelesai, 97);
  assert.equal(hasil.perMinggu.length, 5);
  assert.equal(hasil.perMinggu[0].awal, '2026-09-01');
  assert.equal(hasil.perMinggu[0].akhir, '2026-09-07');
});

test('req_8_2 hitungRekap mengembalikan pesan periode kosong saat tidak ada data sama sekali', async () => {
  const mockStorage = new PenyimpananLaporanMock();
  const controller = new LaporanController(mockStorage);

  const hasil = await controller.hitungRekap({ awal: '2025-01-01', akhir: '2025-01-31' });

  assert.ok('kosong' in hasil);
  assert.equal(hasil.kosong, PESAN_LAPORAN.periodeKosong);
});

test('req_8_3 dan br_8 periksaHakEkspor mengizinkan petugas yang memiliki hak ekspor', async () => {
  const mockStorage = new PenyimpananLaporanMock({ hakEkspor: true });
  const controller = new LaporanController(mockStorage);

  const hasil = await controller.periksaHakEkspor();

  assert.equal(hasil.boleh, true);
});

test('req_8_3 dan br_8 periksaHakEkspor menolak petugas tanpa hak ekspor dengan pesan kamus', async () => {
  const mockStorage = new PenyimpananLaporanMock({ hakEkspor: false });
  const controller = new LaporanController(mockStorage);

  const hasil = await controller.periksaHakEkspor();

  assert.equal(hasil.boleh, false);
  if (!hasil.boleh) {
    assert.equal(hasil.pesan, PESAN_LAPORAN.tanpaHakEkspor);
  }
});

test('periksaHakEkspor menangani kegagalan jaringan/penyimpanan secara aman sebagai tidak berhak', async () => {
  const failStorage = {
    rekapLayanan: async () => {
      throw new Error('boom');
    },
    bolehEkspor: async () => {
      throw new Error('database connection timeout');
    },
  };
  const controller = new LaporanController(failStorage);

  const hasil = await controller.periksaHakEkspor();

  assert.equal(hasil.boleh, false);
  if (!hasil.boleh) {
    assert.equal(hasil.pesan, PESAN_LAPORAN.tanpaHakEkspor);
  }
});

test('PenyimpananLaporanSupabase memanggil rpc rekap_layanan dan memetakan respon ke format camelCase', async () => {
  let rpcDipanggil = '';
  let paramDipanggil: Record<string, unknown> | undefined;

  const fakeClient = {
    rpc: async (fn: string, params?: Record<string, unknown>) => {
      rpcDipanggil = fn;
      paramDipanggil = params;
      return {
        data: {
          total: { panggilan: 100, tereskalasi: 10, pengaduan_selesai: 5 },
          per_minggu: [
            { awal: '2026-09-01', akhir: '2026-09-07', panggilan: 100, tereskalasi: 10, pengaduan_selesai: 5 },
          ],
        },
        error: null,
      };
    },
  };

  const adapter = new PenyimpananLaporanSupabase(fakeClient);
  const hasil = await adapter.rekapLayanan({ awal: '2026-09-01', akhir: '2026-09-07' });

  assert.equal(rpcDipanggil, 'rekap_layanan');
  assert.deepEqual(paramDipanggil, { p_awal: '2026-09-01', p_akhir: '2026-09-07' });
  assert.equal(hasil.total.pengaduanSelesai, 5);
  assert.equal(hasil.perMinggu[0].pengaduanSelesai, 5);
});

test('PenyimpananLaporanSupabase melempar error saat rpc rekap_layanan mengembalikan error', async () => {
  const fakeClient = {
    rpc: async () => ({
      data: null,
      error: new Error('Akses ditolak'),
    }),
  };

  const adapter = new PenyimpananLaporanSupabase(fakeClient);
  await assert.rejects(
    () => adapter.rekapLayanan({ awal: '2026-09-01', akhir: '2026-09-07' }),
    /Akses ditolak/
  );
});

test('PenyimpananLaporanSupabase menangani per_minggu null menjadi array kosong', async () => {
  const fakeClient = {
    rpc: async () => ({
      data: {
        total: { panggilan: 0, tereskalasi: 0, pengaduan_selesai: 0 },
        per_minggu: null,
      },
      error: null,
    }),
  };

  const adapter = new PenyimpananLaporanSupabase(fakeClient);
  const hasil = await adapter.rekapLayanan({ awal: '2026-09-01', akhir: '2026-09-07' });

  assert.deepEqual(hasil.perMinggu, []);
});

test('PenyimpananLaporanSupabase memanggil rpc boleh_ekspor dengan benar', async () => {
  let fnDipanggil = '';
  const fakeClient = {
    rpc: async (fn: string) => {
      fnDipanggil = fn;
      return { data: true, error: null };
    },
  };

  const adapter = new PenyimpananLaporanSupabase(fakeClient);
  const boleh = await adapter.bolehEkspor();

  assert.equal(fnDipanggil, 'boleh_ekspor');
  assert.equal(boleh, true);
});

test('PenyimpananLaporanSupabase mengembalikan false saat rpc boleh_ekspor gagal', async () => {
  const fakeClient = {
    rpc: async () => ({ data: null, error: new Error('Unauthorized') }),
  };

  const adapter = new PenyimpananLaporanSupabase(fakeClient);
  const boleh = await adapter.bolehEkspor();

  assert.equal(boleh, false);
});
