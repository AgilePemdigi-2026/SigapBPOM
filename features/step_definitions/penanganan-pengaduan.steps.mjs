// Langkah Gherkin UC-06 Menangani Pengaduan. Aksi penanganan dijalankan seperti endpoint /api/pengaduan/[tiket]/*:
// helper src/lib/penanganan.ts memanggil PenangananController dengan PenyimpananPenangananMock, lalu memetakan hasilnya
// ke kode HTTP dan pesan kamus. Daftar dan detail pengaduan dibaca PemantauanLayananController dari data tiruan; status
// yang ditulis aksi penanganan disalin ke data itu, sehingga StatusPengaduan membaca status terbaru.
import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { OPSI_TINDAK_LANJUT, PenangananController, PenyimpananPenangananMock } from '../../src/lib/PenangananController.ts';
import { LABEL_STATUS_TIKET, PemantauanLayananController } from '../../src/lib/PemantauanLayananController.ts';
import { simpanJadwal, simpanTanggapan, simpanTelaah, tandaiSudahDihubungi, tutupTiket } from '../../src/lib/penanganan.ts';
import { tautanWhatsApp, teksWhatsApp } from '../../src/lib/kontakPelapor.ts';
import { DAFTAR_TAHAP, LABEL_TAHAP, hitungStatusTahap, tentukanTahapAktif } from '../../src/lib/stepperPenanganan.ts';
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

/**
 * Status tiket di penyimpanan penanganan dan di data pemantauan dibuat sama. Seperti di basis data, tiket berstatus
 * Tanggapan Disusun sudah punya tanggapan resmi tersimpan.
 */
async function aturStatus(dunia, noTiket, status) {
  const { penyimpanan } = uc06(dunia);
  if (status === 'tanggapan_disusun' && !(await penyimpanan.ambilTanggapan(noTiket)).length) {
    penyimpanan.tiketMap.get(noTiket).status = 'sedang_ditelaah';
    await penyimpanan.simpanTanggapan(noTiket, 'Produk telah ditelaah dan pelaku usaha diberi peringatan tertulis.');
  }
  tiketDi(dunia, noTiket).status = status;
  penyimpanan.tiketMap.get(noTiket).status = status;
}

/** Menjalankan aksi penanganan seperti endpoint /api/pengaduan/[tiket]/*: pesan kamus tampil, hasil disimpan. */
async function jalankan(dunia, aksi) {
  const { noTiket, penanganan, penyimpanan } = uc06(dunia);
  const hasil = await aksi(penanganan, noTiket);
  tiketDi(dunia, noTiket).status = penyimpanan.tiketMap.get(noTiket).status;
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
  const penyimpanan = new PenyimpananPenangananMock(Object.fromEntries(data.tiket.map((t) => [t.noTiket, { status: t.status, jenis: t.jenis }])));
  this.uc06 = {
    data,
    penyimpanan,
    pemantauan: new PemantauanLayananController(new PenyimpananPemantauanTiruan(data)),
    penanganan: new PenangananController(penyimpanan),
  };
});

Given('petugas membuka detail pengaduan {string} berstatus {string}', async function (noTiket, status) {
  await aturStatus(this, noTiket, kunciLabel(LABEL_STATUS_TIKET, status));
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
  assert.deepEqual([...OPSI_TINDAK_LANJUT], [a, b, c]);
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
  assert.equal(this.isian['Tindak Lanjut'], 'Perlu Pemeriksaan Lapangan');
  assert.equal(hasil.kode, 200, hasil.pesan);
  assert.equal(hasil.pesan, 'Hasil telaah tersimpan.');
  assert.equal(hasil.data.status, 'sedang_ditelaah');
});

// BR-3: pengaduan yang diteruskan berhenti; jadwal, tanggapan, dan tutup tiket ditolak dan status tidak berubah.
Then('pengaduan tidak dapat dilanjutkan ke tahap berikutnya', async function () {
  const { penanganan, penyimpanan, noTiket } = uc06(this);
  const ditolak = [
    await simpanJadwal(penanganan, noTiket, '2026-10-15', 'Balai Besar POM di Surabaya'),
    await simpanTanggapan(penanganan, noTiket, 'Tanggapan resmi.'),
    await tutupTiket(penanganan, noTiket),
  ];
  for (const h of ditolak) {
    assert.notEqual(h.kode, 200, h.pesan);
    assert.equal(h.data, null);
  }
  assert.equal(penyimpanan.tiketMap.get(noTiket).status, 'diteruskan');
});

// Basic Path langkah 4 (SRS 3.1.10): StepperPenanganan memakai urutan, label, dan perhitungan tahap yang sama dengan
// komponen di halaman Detail Pengaduan. Jadwal dibutuhkan dengan aturan yang sama seperti komponennya.
function tahapStepper(dunia) {
  const { noTiket, detail } = uc06(dunia);
  const status = tiketDi(dunia, noTiket).status;
  const tindakLanjut = detail?.tindakLanjut ?? null;
  return hitungStatusTahap(status, tindakLanjut, status === 'menunggu_pemeriksaan' || tindakLanjut === 'Perlu Pemeriksaan Lapangan');
}
Then('StepperPenanganan menampilkan tahap {string}, {string}, {string}, dan {string}', function (a, b, c, d) {
  assert.deepEqual(DAFTAR_TAHAP.map((t) => LABEL_TAHAP[t]), [a, b, c, d]);
});
Then('tahap {string} aktif', function (tahap) {
  assert.equal(LABEL_TAHAP[tentukanTahapAktif(tahapStepper(this))], tahap);
});

// Basic Path langkah 16 (ADR 0006): tautan WhatsApp disusun seperti panel KontakPelapor di halaman Detail Pengaduan.
Then('pesan WhatsApp untuk pelapor memuat nomor tiket {string} dan tanggapan resmi', async function (noTiket) {
  const { penanganan } = uc06(this);
  const kontak = await penanganan.ambilKontakPelapor(noTiket);
  const [tanggapan] = await penanganan.ambilTanggapan(noTiket);
  const kirimTanggapan = ['tanggapan_disusun', 'selesai'].includes(tiketDi(this, noTiket).status);
  const tautan = tautanWhatsApp(kontak.noTelp, teksWhatsApp({ jenis: 'pengaduan', noTiket, kirimTanggapan, tanggapan: tanggapan?.isi }));
  assert.ok(tautan, 'nomor pelapor tidak sah');
  const teks = decodeURIComponent(new URL(tautan).searchParams.get('text') ?? '');
  assert.ok(teks.includes(`${noTiket} telah selesai ditindaklanjuti`), teks);
  assert.ok(teks.includes(tanggapan.isi), teks);
});
Given('pelapor sudah dihubungi', async function () {
  await uc06(this).penanganan.tandaiSudahDihubungi(uc06(this).noTiket);
});
Then('pelapor tiket {string} tercatat sudah dihubungi', async function (noTiket) {
  assert.equal((await uc06(this).penanganan.ambilKontakPelapor(noTiket)).sudahDihubungi, true);
});

// Langkah 7 sampai 9 Basic Path dan Alternative Path 1 serta 2 (REQ-6.2, BR-3).
tombol('Simpan Telaah', function () {
  return jalankan(this, (c, no) => simpanTelaah(c, no, this.isian['Tindak Lanjut'], this.isian['Catatan Tindak Lanjut'] ?? ''));
});

// Alternative Path 2 langkah 9 sampai 13 (REQ-6.3). Tanggal dikirim dalam bentuk nilai <input type="date">.
tombol('Simpan Jadwal', function () {
  return jalankan(this, (c, no) => simpanJadwal(c, no, nilaiTanggal(this.isian['Tanggal Pemeriksaan']), this.isian['Unit Pelaksana']));
});

// Langkah 10 sampai 13 Basic Path (REQ-6.4).
tombol('Simpan Tanggapan', function () {
  return jalankan(this, (c, no) => simpanTanggapan(c, no, this.isian.Tanggapan));
});

// Langkah 14 sampai 17 Basic Path dan Exception Path 1 (REQ-6.5, REQ-6.6, BR-2).
tombol('Tutup Tiket', function () {
  return jalankan(this, (c, no) => tutupTiket(c, no));
});
tombol('Tandai sudah dihubungi', function () {
  return jalankan(this, (c, no) => tandaiSudahDihubungi(c, no));
});
