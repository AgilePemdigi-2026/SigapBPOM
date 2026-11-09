import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PenangananController,
  PenyimpananPenangananMock,
  PenyimpananPenangananSupabase,
  PESAN_TELAAH_TERSIMPAN,
  PESAN_BUKAN_KEWENANGAN,
  PESAN_JADWAL_TERSIMPAN,
  PESAN_TANGGAPAN_TERSIMPAN,
  PESAN_TUTUP_TIKET,
  PESAN_TUTUP_TANPA_TANGGAPAN,
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

test('req_6_4 simpan tanggapan mengubah status tiket menjadi tanggapan_disusun dan menyimpan isinya', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  const hasil = await controller.simpanTanggapan(
    'ADU-20261104-0010',
    'Produk telah diperiksa dan ditarik dari peredaran.'
  );

  assert.equal(hasil.status, 'tanggapan_disusun');
  assert.equal(hasil.pesan, PESAN_TANGGAPAN_TERSIMPAN);

  const tanggapan = await controller.ambilTanggapan('ADU-20261104-0010');
  assert.equal(tanggapan.length, 1);
  assert.equal(tanggapan[0].isi, 'Produk telah diperiksa dan ditarik dari peredaran.');
});

test('req_6_4 validasi isian tanggapan wajib diisi', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  await assert.rejects(
    () => controller.simpanTanggapan('ADU-20261104-0010', '   '),
    /Tanggapan wajib diisi/
  );
});

test('req_6_5 dan br_2 tutup tiket tanpa tanggapan ditolak dengan pesan kamus', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  // Tiket ADU-20261104-0010 belum memiliki tanggapan
  await assert.rejects(
    () => controller.tutupTiket('ADU-20261104-0010'),
    (err: Error) => err.message === PESAN_TUTUP_TANPA_TANGGAPAN
  );
});

test('req_6_6 tutup tiket dengan tanggapan mengubah status menjadi selesai dan mengantrekan notifikasi', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  await controller.simpanTanggapan('ADU-20261104-0010', 'Tanggapan resmi petugas BPOM.');
  const hasilTutup = await controller.tutupTiket('ADU-20261104-0010');

  assert.equal(hasilTutup.status, 'selesai');
  assert.equal(hasilTutup.pesan, PESAN_TUTUP_TIKET);
  assert.equal(mockStorage.notifikasiList.length, 1);
  assert.equal(mockStorage.notifikasiList[0].tiketId, 'ADU-20261104-0010');
});

test('req_6_6 menutup tiket berulang kali bersifat idempoten dan tidak menduplikasi notifikasi', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  await controller.simpanTanggapan('ADU-20261104-0010', 'Tanggapan resmi petugas BPOM.');
  await controller.tutupTiket('ADU-20261104-0010');
  assert.equal(mockStorage.notifikasiList.length, 1);

  // Panggil tutupTiket kedua kali
  const hasilKedua = await controller.tutupTiket('ADU-20261104-0010');
  assert.equal(hasilKedua.status, 'selesai');
  assert.equal(mockStorage.notifikasiList.length, 1);
});

test('br_3 tiket berstatus diteruskan atau selesai tidak dapat ditanggapi', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  await assert.rejects(
    () => controller.simpanTanggapan('ADU-20261104-0040', 'Tanggapan untuk tiket selesai'),
    /sudah selesai/
  );

  await assert.rejects(
    () => controller.simpanTanggapan('ADU-20261104-0050', 'Tanggapan untuk tiket diteruskan'),
    /sudah diteruskan/
  );
});

test('adapter Supabase memanggil RPC penanganan pengaduan', async () => {
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
      if (fn === 'simpan_tanggapan') {
        return Promise.resolve({
          data: 'tanggapan_disusun',
          error: null,
        });
      }
      if (fn === 'tutup_tiket') {
        return Promise.resolve({
          data: 'selesai',
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

  const resTanggapan = await controller.simpanTanggapan('ADU-20261104-0010', 'Tanggapan resmi');
  assert.equal(resTanggapan.status, 'tanggapan_disusun');
  assert.equal(panggilanRpc[2].fn, 'simpan_tanggapan');

  const resTutup = await controller.tutupTiket('ADU-20261104-0010');
  assert.equal(resTutup.status, 'selesai');
  assert.equal(panggilanRpc[3].fn, 'tutup_tiket');
});
