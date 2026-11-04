import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PenangananController, type PenyimpananPenanganan } from './PenangananController.ts';
import { PenyimpananPenangananTiruan } from './mock/penangananTiruan.ts';
import { contohPemantauan } from './mock/pemantauanTiruan.ts';

// Tiket pertama contoh pemantauan berstatus Belum Ditelaah, prasyarat UC-06.
function siapkan() {
  const penyimpanan = new PenyimpananPenangananTiruan(contohPemantauan().tiket);
  return { penanganan: new PenangananController(penyimpanan), noTiket: penyimpanan.tiket[0].noTiket };
}

const ringkas = (h: { kode: number; pesan: string; data: { status: string | null } | null }) => [h.kode, h.pesan, h.data?.status ?? null];

test('req_6_2 req_6_4 req_6_6 basic path tiruan: telaah dokumen, tanggapan, lalu tiket ditutup', async () => {
  const { penanganan, noTiket } = siapkan();
  assert.deepEqual(ringkas(await penanganan.simpanTelaah(noTiket, 'telaah_dokumen', 'Label produk tidak mencantumkan nomor izin edar.')), [200, 'Hasil telaah tersimpan.', 'sedang_ditelaah']);
  assert.deepEqual(ringkas(await penanganan.simpanTanggapan(noTiket, 'Pelaku usaha diberi peringatan tertulis.')), [200, 'Tanggapan tersimpan.', 'tanggapan_disusun']);
  assert.deepEqual(ringkas(await penanganan.tutupTiket(noTiket)), [200, 'Tiket ditutup.', 'selesai']);
  assert.deepEqual(ringkas(await penanganan.tutupTiket(noTiket)), [200, 'Tiket ditutup.', 'selesai']);
});

test('br_3 alternative path 1 tiruan: pengaduan diteruskan dan tidak lanjut ke tahap berikutnya', async () => {
  const { penanganan, noTiket } = siapkan();
  assert.deepEqual(ringkas(await penanganan.simpanTelaah(noTiket, 'bukan_kewenangan_bpom', 'Produk berupa alat elektronik.')), [200, 'Pengaduan diteruskan ke instansi lain.', 'diteruskan']);
  for (const h of [await penanganan.simpanTelaah(noTiket, 'telaah_dokumen', ''), await penanganan.simpanTanggapan(noTiket, 'Tanggapan'), await penanganan.tutupTiket(noTiket)]) {
    assert.deepEqual(ringkas(h), [422, 'Permintaan tidak valid.', null]);
  }
});

test('req_6_3 alternative path 2 tiruan: jadwal pemeriksaan tersimpan dengan status Menunggu Pemeriksaan', async () => {
  const { penanganan, noTiket } = siapkan();
  assert.deepEqual(ringkas(await penanganan.simpanTelaah(noTiket, 'perlu_pemeriksaan_lapangan', 'Perlu pemeriksaan sarana produksi.')), [200, 'Hasil telaah tersimpan.', 'sedang_ditelaah']);
  assert.deepEqual(ringkas(await penanganan.simpanJadwal(noTiket, '2026-10-15', 'Balai Besar POM di Surabaya')), [200, 'Jadwal pemeriksaan tersimpan.', 'menunggu_pemeriksaan']);
  assert.deepEqual(ringkas(await penanganan.simpanTanggapan(noTiket, 'Hasil pemeriksaan sarana.')), [200, 'Tanggapan tersimpan.', 'tanggapan_disusun']);
});

test('req_6_5 br_2 exception path 1 tiruan: tutup sebelum tanggapan ditolak dan status tidak berubah', async () => {
  const { penanganan, noTiket } = siapkan();
  await penanganan.simpanTelaah(noTiket, 'telaah_dokumen', '');
  assert.deepEqual(ringkas(await penanganan.tutupTiket(noTiket)), [422, 'Tiket tidak dapat ditutup. Susun tanggapan terlebih dahulu.', null]);
  assert.equal((penanganan.penyimpanan as PenyimpananPenangananTiruan).tiket[0].status, 'sedang_ditelaah');
});

test('req_6_2 tiket yang tidak ada dan galat penyimpanan tak dikenal dipetakan ke pesan', async () => {
  const { penanganan } = siapkan();
  assert.deepEqual(ringkas(await penanganan.tutupTiket('ADU-20000101-9999')), [404, 'Tiket tidak ditemukan.', null]);
  const rusak = new PenangananController({ tutupTiket: async () => { throw new Error('koneksi putus'); } } as unknown as PenyimpananPenanganan);
  assert.deepEqual(ringkas(await rusak.tutupTiket('ADU-20000101-9999')), [500, 'Terjadi kesalahan pada sistem.', null]);
});
