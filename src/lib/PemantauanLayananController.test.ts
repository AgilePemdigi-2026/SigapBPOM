import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PemantauanLayananController,
  PenyimpananPemantauanMock,
  type DataRingkasanLayanan,
} from './PemantauanLayananController.ts';

test('req_4_1 ringkasan layanan mengembalikan statistik default dalam state awal', async () => {
  const mockStorage = new PenyimpananPemantauanMock();
  const controller = new PemantauanLayananController(mockStorage);

  const ringkasan = await controller.ambilRingkasan();
  assert.equal(ringkasan.statistik.panggilanHariIni, 0);
  assert.equal(ringkasan.statistik.jawabanOtomatisAi, 0);
  assert.equal(ringkasan.statistik.tiketEskalasiBaru, 0);
  assert.equal(ringkasan.statistik.pengaduanSelesai, 0);
  assert.equal(ringkasan.statistik.panggilanBerjalan, 0);
  assert.deepEqual(ringkasan.kategori, []);
  assert.deepEqual(ringkasan.kasusPerluTindakLanjut, []);
});

test('req_4_1 ringkasan layanan mengembalikan 5 metrik statistik sesuai data penyimpanan', async () => {
  const dummy: DataRingkasanLayanan = {
    statistik: {
      panggilanHariIni: 42,
      jawabanOtomatisAi: 35,
      tiketEskalasiBaru: 5,
      pengaduanSelesai: 8,
      panggilanBerjalan: 2,
    },
    kategori: [
      { kategori: 'Obat', jumlah: 20, persentase: 50.0 },
      { kategori: 'Makanan', jumlah: 12, persentase: 30.0 },
      { kategori: 'Kosmetik', jumlah: 8, persentase: 20.0 },
    ],
    kasusPerluTindakLanjut: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        noTiket: 'ESK-20261102-0001',
        jenis: 'eskalasi',
        ringkasan: 'Pertanyaan interaksi obat',
        status: 'belum_ditelaah',
        tglTerbit: '2026-11-02T10:00:00Z',
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        noTiket: 'ADU-20261102-0001',
        jenis: 'pengaduan',
        ringkasan: 'Reaksi alergi kosmetik',
        status: 'belum_ditelaah',
        tglTerbit: '2026-11-02T11:30:00Z',
      },
    ],
  };

  const mockStorage = new PenyimpananPemantauanMock({ ringkasan: dummy });
  const controller = new PemantauanLayananController(mockStorage);

  const ringkasan = await controller.ambilRingkasan();
  assert.equal(ringkasan.statistik.panggilanHariIni, 42);
  assert.equal(ringkasan.statistik.jawabanOtomatisAi, 35);
  assert.equal(ringkasan.statistik.tiketEskalasiBaru, 5);
  assert.equal(ringkasan.statistik.pengaduanSelesai, 8);
  assert.equal(ringkasan.statistik.panggilanBerjalan, 2);

  // Verifikasi kategori
  assert.equal(ringkasan.kategori.length, 3);
  assert.equal(ringkasan.kategori[0].kategori, 'Obat');
  assert.equal(ringkasan.kategori[0].persentase, 50.0);

  // Verifikasi kasus perlu tindak lanjut
  assert.equal(ringkasan.kasusPerluTindakLanjut.length, 2);
  assert.equal(ringkasan.kasusPerluTindakLanjut[0].noTiket, 'ESK-20261102-0001');
  assert.equal(ringkasan.kasusPerluTindakLanjut[0].status, 'belum_ditelaah');

  // Verifikasi method ambilStatistik
  const stat = await controller.ambilStatistik();
  assert.equal(stat.panggilanHariIni, 42);
  assert.equal(stat.jawabanOtomatisAi, 35);
});

test('req_4_2 ambilPanggilanAktif mengembalikan daftar panggilan atau array kosong', async () => {
  const mockStorage = new PenyimpananPemantauanMock({
    panggilanAktif: [
      {
        id: 'call-1',
        noTelp: '0812****7890',
        jenisLayanan: 'informasi_produk',
        topik: 'Obat',
        waktuMulai: '2026-11-02T13:00:00Z',
        durasiDetik: 45,
        tahapAi: 'cek_registrasi',
      },
    ],
  });
  const controller = new PemantauanLayananController(mockStorage);

  const panggilan = await controller.ambilPanggilanAktif();
  assert.equal(panggilan.length, 1);
  assert.equal(panggilan[0].id, 'call-1');
  assert.equal(panggilan[0].durasiDetik, 45);
});

test('req_4_3 ambilAntreanTiket mengembalikan daftar antrean tiket', async () => {
  const mockStorage = new PenyimpananPemantauanMock({
    antreanTiket: [
      {
        id: 'tiket-1',
        noTiket: 'ADU-20261102-0001',
        jenis: 'pengaduan',
        ringkasan: 'Iritasi kulit',
        status: 'belum_ditelaah',
        waktuMasuk: '2026-11-02T13:10:00Z',
      },
    ],
  });
  const controller = new PemantauanLayananController(mockStorage);

  const antrean = await controller.ambilAntreanTiket();
  assert.equal(antrean.length, 1);
  assert.equal(antrean[0].noTiket, 'ADU-20261102-0001');
});
