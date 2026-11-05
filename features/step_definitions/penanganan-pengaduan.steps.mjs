// Langkah Gherkin UC-06 Menangani Pengaduan. Aksi penanganan memakai PenangananController dengan
// PenyimpananPenangananTiruan (mesin status RPC penanganan). Halaman Daftar Pengaduan (T-F7.1-02) dan panel penanganan
// (T-F7.2-02) belum dibuat, jadi daftar dan detail pengaduan dibaca lewat control padanannya: antrean dan detail kasus
// PemantauanLayananController, yang menautkan setiap tiket ke /pengaduan/detail. Keduanya berbagi data tiket tiruan,
// sehingga StatusPengaduan membaca status yang ditulis aksi penanganan.
import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { LABEL_TINDAK_LANJUT, PenangananController } from '../../src/lib/PenangananController.ts';
import { LABEL_STATUS_TIKET, PemantauanLayananController } from '../../src/lib/PemantauanLayananController.ts';
import { PenyimpananPenangananTiruan } from '../../src/lib/mock/penangananTiruan.ts';
import { PenyimpananPemantauanTiruan } from '../../src/lib/mock/pemantauanTiruan.ts';
import { kunciLabel, nilaiTanggal, tombol } from '../support/dashboard.mjs';

function uc06(dunia) {
  assert.ok(dunia.uc06, 'data pengaduan belum disiapkan');
  return dunia.uc06;
}

const tiketDi = (dunia, noTiket) => {
  const t = uc06(dunia).data.tiket.find((x) => x.noTiket === noTiket);
  assert.ok(t, `tiket ${noTiket} tidak ada`);
  return t;
};

async function bukaDetail(dunia, noTiket) {
  const detail = await uc06(dunia).pemantauan.detailKasus(noTiket);
  assert.ok(!('gagal' in detail), detail.gagal);
  dunia.halaman = '/pengaduan/detail';
  dunia.uc06.noTiket = noTiket;
  dunia.uc06.detail = detail;
}

/** Menjalankan aksi penanganan seperti endpoint /api/pengaduan/[tiket]/*: pesan kamus tampil, hasil disimpan. */
async function jalankan(dunia, aksi) {
  const hasil = await aksi(uc06(dunia).penanganan, dunia.uc06.noTiket);
  dunia.uc06.hasil = hasil;
  dunia.pesan = hasil.pesan;
}

Given('terdapat pengaduan:', function (tabel) {
  const data = { percakapan: [], logTool: [], tiket: [] };
  tabel.hashes().forEach((b, i) => {
    const percakapanId = `p-${i + 1}`;
    data.percakapan.push({
      id: percakapanId, noTelp: '0812****7890', namaPelapor: 'B*** S******', waktuMulai: '2026-10-20T02:15:00Z',
      jenisInteraksi: 'pengaduan', status: 'tiket_terbit', tahapAi: null, topik: 'Kosmetik',
    });
    data.tiket.push({
      id: `t-${i + 1}`,
      noTiket: b['nomor tiket'],
      jenis: 'pengaduan',
      percakapanId,
      ringkasan: b.ringkasan,
      status: kunciLabel(LABEL_STATUS_TIKET, b.status),
      tglTerbit: `2026-10-${20 - i}T02:20:00Z`,
      pengaduan: { namaProduk: b.produk, kronologi: b.ringkasan, kelengkapan: true, tglPengaduan: `2026-10-${20 - i}T02:20:00Z` },
    });
  });
  this.uc06 = {
    data,
    pemantauan: new PemantauanLayananController(new PenyimpananPemantauanTiruan(data)),
    penanganan: new PenangananController(new PenyimpananPenangananTiruan(data.tiket)),
  };
});

Given('petugas membuka detail pengaduan {string} berstatus {string}', async function (noTiket, status) {
  tiketDi(this, noTiket).status = kunciLabel(LABEL_STATUS_TIKET, status);
  await bukaDetail(this, noTiket);
});

// Langkah 1 dan 2 Basic Path.
When('petugas membuka halaman daftar pengaduan', async function () {
  const antrean = await uc06(this).pemantauan.antreanTiket();
  assert.ok(!('gagal' in antrean), antrean.gagal);
  this.uc06.antrean = antrean.tiket;
});

Then('daftar pengaduan menampilkan:', function (tabel) {
  const tampil = this.uc06.antrean.map((t) => ({ 'nomor tiket': t.noTiket, status: t.labelStatus }));
  assert.deepEqual(tampil, tabel.hashes());
});

// Langkah 3 dan 4: tombol "Telaah" membuka detail pengaduan lewat tautan baris.
When('petugas menekan {string} pada pengaduan berstatus {string}', async function (label, status) {
  assert.equal(label, 'Telaah');
  const baris = this.uc06.antrean.find((t) => t.jenis === 'Pengaduan' && t.labelStatus === status);
  assert.ok(baris, `tidak ada pengaduan berstatus ${status}`);
  const tautan = new URL(baris.tautanKasus, 'http://sigap.test');
  assert.equal(tautan.pathname, '/pengaduan/detail');
  await bukaDetail(this, tautan.searchParams.get('tiket'));
});

Then('detail pengaduan {string} untuk produk {string} ditampilkan', function (noTiket, produk) {
  const { detail } = uc06(this);
  assert.equal(detail.noTiket, noTiket);
  assert.equal(detail.namaProduk, produk);
});

// REQ-6.1.
Then('pilihan {string} berisi {string}, {string}, dan {string}', function (field, a, b, c) {
  assert.equal(field, 'Tindak Lanjut');
  assert.deepEqual(Object.values(LABEL_TINDAK_LANJUT), [a, b, c]);
});

// Status dibaca ulang dari detail pengaduan, seperti halaman detail sesudah aksi; status di respons aksi harus sama bila ada.
Then('StatusPengaduan menampilkan {string}', async function (status) {
  const { hasil, noTiket } = uc06(this);
  if (hasil?.data) assert.equal(hasil.data.labelStatus, status);
  await bukaDetail(this, noTiket);
  assert.equal(this.uc06.detail.labelStatus, status);
});

// Alternative Path 2 langkah 8: telaah "Perlu Pemeriksaan Lapangan" tersimpan, tiket menunggu jadwal (REQ-6.2), dan
// formulir jadwal dibuka. Status baru menjadi Menunggu Pemeriksaan setelah jadwal tersimpan.
Then('sistem menampilkan formulir jadwal pemeriksaan', function () {
  const { hasil } = uc06(this);
  assert.equal(this.isian['Tindak Lanjut'], LABEL_TINDAK_LANJUT.perlu_pemeriksaan_lapangan);
  assert.equal(hasil.kode, 200, hasil.pesan);
  assert.equal(hasil.pesan, 'Hasil telaah tersimpan.');
  assert.equal(hasil.data.status, 'sedang_ditelaah');
});

// BR-3: pengaduan yang diteruskan berhenti; jadwal, tanggapan, dan tutup tiket ditolak dan status tidak berubah.
Then('pengaduan tidak dapat dilanjutkan ke tahap berikutnya', async function () {
  const { penanganan, noTiket } = uc06(this);
  const ditolak = [
    await penanganan.simpanJadwal(noTiket, '2026-10-15', 'Balai Besar POM di Surabaya'),
    await penanganan.simpanTanggapan(noTiket, 'Tanggapan resmi.'),
    await penanganan.tutupTiket(noTiket),
  ];
  for (const h of ditolak) assert.deepEqual([h.kode, h.data], [422, null]);
  assert.equal(tiketDi(this, noTiket).status, 'diteruskan');
});

// @belum-tersedia: StepperPenanganan menunggu panel penanganan (T-F7.2-02), SMS menunggu T-F7.3-01.
Then('StepperPenanganan menampilkan tahap {string}, {string}, {string}, dan {string}', function (_a, _b, _c, _d) {
  return 'pending';
});
Then('tahap {string} aktif', function (_tahap) {
  return 'pending';
});
Then('SMS tindak lanjut tiket {string} terkirim kepada pelapor', function (_noTiket) {
  return 'pending';
});

// Langkah 7 sampai 9 Basic Path dan Alternative Path 1 serta 2 (REQ-6.2, BR-3).
tombol('Simpan Telaah', function () {
  const tindakLanjut = kunciLabel(LABEL_TINDAK_LANJUT, this.isian['Tindak Lanjut']);
  return jalankan(this, (c, no) => c.simpanTelaah(no, tindakLanjut, this.isian['Catatan Tindak Lanjut'] ?? ''));
});

// Alternative Path 2 langkah 9 sampai 13 (REQ-6.3). Tanggal dikirim dalam bentuk nilai <input type="date">.
tombol('Simpan Jadwal', function () {
  return jalankan(this, (c, no) => c.simpanJadwal(no, nilaiTanggal(this.isian['Tanggal Pemeriksaan']), this.isian['Unit Pelaksana']));
});

// Langkah 10 sampai 13 Basic Path (REQ-6.4).
tombol('Simpan Tanggapan', function () {
  return jalankan(this, (c, no) => c.simpanTanggapan(no, this.isian.Tanggapan));
});

// Langkah 14 sampai 17 Basic Path dan Exception Path 1 (REQ-6.5, REQ-6.6, BR-2).
tombol('Tutup Tiket', function () {
  return jalankan(this, (c, no) => c.tutupTiket(no));
});
