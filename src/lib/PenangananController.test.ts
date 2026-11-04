import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PenangananController,
  PenyimpananPenangananMock,
  PenyimpananPenangananSupabase,
  PESAN_TELAAH_TERSIMPAN,
  PESAN_BUKAN_KEWENANGAN,
  PESAN_JADWAL_TERSIMPAN,
  type TindakLanjut,
} from './PenangananController.ts';

test('req_6_1 dan req_6_2 simpan telaah dokumen mengubah status menjadi sedang_ditelaah', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  const hasil = await controller.simpanTelaah(
    'ADU-20261104-0010',
    'Telaah Dokumen',
    'Label produk tidak mencantumkan nomor izin edar.'
  );

  assert.equal(hasil.status, 'sedang_ditelaah');
  assert.equal(hasil.pesan, PESAN_TELAAH_TERSIMPAN);

  const riwayat = await controller.ambilRiwayatTelaah('ADU-20261104-0010');
  assert.equal(riwayat.length, 1);
  assert.equal(riwayat[0].tindakLanjut, 'Telaah Dokumen');
  assert.equal(riwayat[0].catatan, 'Label produk tidak mencantumkan nomor izin edar.');
});

test('req_6_2 telaah perlu pemeriksaan lapangan menunggu jadwal dengan status sedang_ditelaah', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  const hasil = await controller.simpanTelaah(
    'ADU-20261104-0020',
    'Perlu Pemeriksaan Lapangan',
    'Perlu sampling produk di gudang distributor.'
  );

  assert.equal(hasil.status, 'sedang_ditelaah');
  assert.equal(hasil.pesan, PESAN_TELAAH_TERSIMPAN);
});

test('br_3 bukan kewenangan bpom mengubah status menjadi diteruskan dan berhenti', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  const hasil = await controller.simpanTelaah(
    'ADU-20261104-0030',
    'Bukan Kewenangan BPOM',
    'Produk masuk kategori industri rumah tangga daerah.'
  );

  assert.equal(hasil.status, 'diteruskan');
  assert.equal(hasil.pesan, PESAN_BUKAN_KEWENANGAN);

  // Upaya menelaah kembali tiket yang berstatus diteruskan ditolak
  await assert.rejects(
    () => controller.simpanTelaah('ADU-20261104-0030', 'Telaah Dokumen', 'Upaya telaah ulang'),
    /sudah diteruskan ke instansi lain/
  );
});

test('br_3 tiket yang sudah berstatus selesai tidak dapat ditelaah lagi', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  await assert.rejects(
    () => controller.simpanTelaah('ADU-20261104-0040', 'Telaah Dokumen', 'Catatan telaah'),
    /sudah selesai/
  );
});

test('req_6_3 simpan jadwal pemeriksaan menetapkan tanggal dan status menunggu_pemeriksaan', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  // Mula-mula telaah lapangan
  await controller.simpanTelaah('ADU-20261104-0020', 'Perlu Pemeriksaan Lapangan', 'Perlu sidak sarana.');

  // Simpan jadwal
  const hasilJadwal = await controller.simpanJadwalPemeriksaan(
    'ADU-20261104-0020',
    '2026-11-15',
    'BBPOM di Surabaya'
  );

  assert.equal(hasilJadwal.status, 'menunggu_pemeriksaan');
  assert.equal(hasilJadwal.tanggal, '2026-11-15');
  assert.equal(hasilJadwal.unitPelaksana, 'BBPOM di Surabaya');
  assert.equal(hasilJadwal.pesan, PESAN_JADWAL_TERSIMPAN);

  const jadwal = await controller.ambilJadwal('ADU-20261104-0020');
  assert.equal(jadwal.length, 1);
  assert.equal(jadwal[0].unitPelaksana, 'BBPOM di Surabaya');
});

test('req_6_3 validasi isian jadwal pemeriksaan wajib diisi', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  await assert.rejects(
    () => controller.simpanJadwalPemeriksaan('ADU-20261104-0020', '', 'BBPOM'),
    /Tanggal pemeriksaan wajib diisi/
  );

  await assert.rejects(
    () => controller.simpanJadwalPemeriksaan('ADU-20261104-0020', '2026-11-15', '   '),
    /Unit pelaksana wajib diisi/
  );
});

test('adapter Supabase memanggil RPC simpan_telaah dan simpan_jadwal_pemeriksaan', async () => {
  const panggilanRpc: { fn: string; params: unknown }[] = [];

  const mockSupabase = {
    rpc(fn: string, params?: Record<string, unknown>) {
      panggilanRpc.push({ fn, params });
      if (fn === 'simpan_telaah') {
        return Promise.resolve({
          data: {
            id: 'uuid-telaah-1',
            no_tiket: 'ADU-20261104-0010',
            status: 'sedang_ditelaah',
            tindak_lanjut: 'telaah_dokumen',
            pesan: PESAN_TELAAH_TERSIMPAN,
          },
          error: null,
        });
      }
      if (fn === 'simpan_jadwal_pemeriksaan') {
        return Promise.resolve({
          data: {
            id: 'uuid-jadwal-1',
            no_tiket: 'ADU-20261104-0010',
            status: 'menunggu_pemeriksaan',
            tanggal: '2026-11-15',
            unit_pelaksana: 'BBPOM',
            pesan: PESAN_JADWAL_TERSIMPAN,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    },
  };

  const adapter = new PenyimpananPenangananSupabase(mockSupabase);
  const controller = new PenangananController(adapter);

  const resTelaah = await controller.simpanTelaah('ADU-20261104-0010', 'Telaah Dokumen', 'Catatan uji');
  assert.equal(resTelaah.status, 'sedang_ditelaah');
  assert.equal(panggilanRpc[0].fn, 'simpan_telaah');

  const resJadwal = await controller.simpanJadwalPemeriksaan('ADU-20261104-0010', '2026-11-15', 'BBPOM');
  assert.equal(resJadwal.status, 'menunggu_pemeriksaan');
  assert.equal(panggilanRpc[1].fn, 'simpan_jadwal_pemeriksaan');
});
