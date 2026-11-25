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
  PESAN_SUDAH_DIHUBUNGI,
  PESAN_TUTUP_BELUM_DIHUBUNGI,
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

test('req_6_6 adr_0006 tutup tiket bertanggapan ditolak sampai pelapor dihubungi, lalu selesai', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  await controller.simpanTanggapan('ADU-20261104-0010', 'Tanggapan resmi petugas BPOM.');
  await assert.rejects(() => controller.tutupTiket('ADU-20261104-0010'), (err: Error) => err.message === PESAN_TUTUP_BELUM_DIHUBUNGI);

  await controller.tandaiSudahDihubungi('ADU-20261104-0010');
  const hasilTutup = await controller.tutupTiket('ADU-20261104-0010');
  assert.equal(hasilTutup.status, 'selesai');
  assert.equal(hasilTutup.pesan, PESAN_TUTUP_TIKET);
  assert.equal(mockStorage.notifikasiList.length, 1);
});

test('req_6_6 menutup tiket berulang kali bersifat idempoten dan tidak menduplikasi catatan kontak', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  await controller.simpanTanggapan('ADU-20261104-0010', 'Tanggapan resmi petugas BPOM.');
  await controller.tandaiSudahDihubungi('ADU-20261104-0010');
  await controller.tutupTiket('ADU-20261104-0010');
  assert.equal((await controller.tutupTiket('ADU-20261104-0010')).status, 'selesai');
  await controller.tandaiSudahDihubungi('ADU-20261104-0010');
  assert.equal(mockStorage.notifikasiList.length, 1);
});

test('adr_0006 pengaduan bisa ditandai sudah dihubungi setelah tanggapan tersimpan, sebelum ditutup', async () => {
  const mockStorage = new PenyimpananPenangananMock();
  const controller = new PenangananController(mockStorage);

  await assert.rejects(() => controller.tandaiSudahDihubungi('ADU-20261104-0010'), /belum punya tanggapan/);
  await controller.simpanTanggapan('ADU-20261104-0010', 'Tanggapan resmi petugas BPOM.');
  assert.equal((await controller.ambilKontakPelapor('ADU-20261104-0010')).sudahDihubungi, false);

  const hasil = await controller.tandaiSudahDihubungi('ADU-20261104-0010');
  assert.equal(hasil.pesan, PESAN_SUDAH_DIHUBUNGI);
  const kontak = await controller.ambilKontakPelapor('ADU-20261104-0010');
  assert.equal(kontak.sudahDihubungi, true);
  assert.ok(kontak.dihubungiPada);
  assert.equal(mockStorage.tiketMap.get('ADU-20261104-0010')?.status, 'tanggapan_disusun');
});

