// Langkah Gherkin UC-05 Membaca Transkrip Percakapan. Daftar percakapan memakai TranskripController dengan
// PenyimpananRiwayatTiruan, seperti halaman /riwayat-percakapan; detail transkrip dan catatan pemeriksaan memakai
// TranskripController dengan PenyimpananTranskripMock. Kedua penyimpanan diisi dari tabel Latar Belakang yang sama.
// Elemen TranskripPercakapan dan RingkasanPercakapan (Lampiran B) diperiksa dari detail yang disiapkan control untuk elemen itu.
import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { LABEL_STATUS_PENYELESAIAN, PenyimpananTranskripMock, TranskripController } from '../../src/lib/TranskripController.ts';
import { PenyimpananRiwayatTiruan } from '../../src/lib/mock/riwayatTiruan.ts';
import { tombol } from '../support/dashboard.mjs';

// Nomor telepon Indonesia yang tidak tersamar (NFR-13), misalnya 081234567890.
const NOMOR_UTUH = /(?<!\d)(?:\+?62|0)8\d{8,11}(?!\d)/;

function uc05(dunia) {
  dunia.uc05 ??= { percakapan: [], transkrip: {} };
  return dunia.uc05;
}

// Penyimpanan detail dibuat sekali per skenario agar catatan yang disimpan bisa dibaca lagi.
function controllerDetail(dunia) {
  const d = uc05(dunia);
  d.detailController ??= new TranskripController(
    new PenyimpananTranskripMock({
      riwayat: d.percakapan.map((p) => ({
        id: p.id,
        percakapanId: p.id,
        waktuMulai: p.waktuMulai,
        waktuSelesai: null,
        jenisInteraksi: p.jenisInteraksi,
        ringkasan: p.ringkasan,
        statusPenyelesaian: p.statusPenyelesaian,
        noTiket: null,
        noTelp: null,
        noTelpTersamar: null,
      })),
      transkrip: d.transkrip,
      catatan: {},
    }),
  );
  return d.detailController;
}

async function bukaDetail(dunia, id) {
  const detail = await controllerDetail(dunia).ambilDetailTranskrip(id);
  assert.ok(detail, `percakapan ${id} tidak ditemukan`);
  dunia.halaman = '/riwayat-percakapan/detail';
  dunia.uc05.id = id;
  dunia.uc05.detail = detail;
}

const teksTranskrip = (dunia) => dunia.uc05.detail.ucapan.map((u) => u.teks).join('\n');

Given('petugas sudah masuk ke dashboard SIGAP pada {int}-{int}-{int} pukul {int}.{int} WIB', function (tgl, bln, thn, jam, menit) {
  const dua = (n) => String(n).padStart(2, '0');
  uc05(this).sekarang = new Date(`${thn}-${dua(bln)}-${dua(tgl)}T${dua(jam)}:${dua(menit)}:00+07:00`);
});

Given('register layanan berisi percakapan:', function (tabel) {
  uc05(this).percakapan = tabel.hashes().map((b) => ({
    id: b.id,
    waktuMulai: b['waktu mulai'],
    jenisInteraksi: b.jenis || null,
    ringkasan: b.ringkasan || null,
    statusPenyelesaian: b.status,
  }));
});

Given('transkrip percakapan {string} tersimpan sebagai:', function (id, tabel) {
  uc05(this).transkrip[id] = tabel.hashes().map((b, i) => ({
    id: i + 1,
    percakapanId: id,
    urutan: i + 1,
    pembicara: b.pembicara,
    teks: b.teks,
    detikKe: Number(b.detik),
  }));
});

Given('petugas membuka transkrip percakapan {string}', async function (id) {
  await bukaDetail(this, id);
});

// Langkah 1 dan 2 Basic Path: halaman riwayat percakapan menampilkan periode bulan berjalan.
When('petugas membuka halaman riwayat percakapan', async function () {
  const d = uc05(this);
  const daftar = await new TranskripController(new PenyimpananRiwayatTiruan(d.percakapan)).ambilDaftarPercakapan({}, d.sekarang);
  assert.ok(!('gagal' in daftar), daftar.gagal);
  this.halaman = '/riwayat-percakapan';
  d.daftar = daftar;
});

// Langkah 3: tombol "Lihat Transkrip" mengikuti tautan baris ke halaman detail.
When('petugas menekan {string} pada percakapan {string}', async function (label, ringkasan) {
  assert.equal(label, 'Lihat Transkrip');
  const baris = this.uc05.daftar.percakapan.find((p) => p.ringkasan === ringkasan);
  assert.ok(baris, `tidak ada percakapan "${ringkasan}" di daftar`);
  const tautan = new URL(baris.tautanTranskrip, 'http://sigap.test');
  assert.equal(tautan.pathname, '/riwayat-percakapan/detail');
  await bukaDetail(this, tautan.searchParams.get('id'));
});

Then('daftar percakapan menampilkan:', function (tabel) {
  const tampil = this.uc05.daftar.percakapan.map((p) => ({
    waktu: p.waktu,
    jenis: p.jenis,
    ringkasan: p.ringkasan,
    'status penyelesaian': p.labelStatus,
  }));
  assert.deepEqual(tampil, tabel.hashes());
});

Then('ringkasan periode berisi {int} percakapan, {int} informasi produk, {int} pengaduan produk, dan {int} dieskalasi', function (total, informasiProduk, pengaduanProduk, dieskalasi) {
  assert.deepEqual(this.uc05.daftar.ringkasan, { total, informasiProduk, pengaduanProduk, dieskalasi });
});

Then('TranskripPercakapan menampilkan {int} ucapan berurutan dengan stempel waktu', function (jumlah) {
  const { ucapan } = this.uc05.detail;
  assert.equal(ucapan.length, jumlah);
  ucapan.forEach((u, i) => {
    assert.equal(u.urutan, i + 1);
    assert.ok(Number.isFinite(u.detikKe), `ucapan ${u.urutan} tanpa stempel waktu`);
    if (i) assert.ok(u.detikKe >= ucapan[i - 1].detikKe, 'stempel waktu mundur');
  });
});

Then('RingkasanPercakapan menampilkan {string} dengan status penyelesaian {string}', function (ringkasan, status) {
  const { percakapan } = this.uc05.detail;
  assert.equal(percakapan.ringkasan, ringkasan);
  assert.equal(LABEL_STATUS_PENYELESAIAN[percakapan.statusPenyelesaian], status);
});

Then('TranskripPercakapan memuat {string}', function (teks) {
  assert.ok(teksTranskrip(this).includes(teks), teksTranskrip(this));
});

Then('TranskripPercakapan tidak memuat nomor telepon utuh', function () {
  assert.doesNotMatch(teksTranskrip(this), NOMOR_UTUH);
});

Then('catatan pemeriksaan {string} tersimpan pada percakapan {string}', async function (isi, id) {
  const catatan = await controllerDetail(this).ambilCatatanPemeriksaan(id);
  assert.deepEqual(catatan.map((c) => c.isi), [isi]);
  const detail = await controllerDetail(this).ambilDetailTranskrip(id);
  assert.deepEqual(detail.catatanPemeriksaan.map((c) => c.isi), [isi]);
});

Then('tidak ada catatan pemeriksaan tersimpan pada percakapan {string}', async function (id) {
  assert.deepEqual(await controllerDetail(this).ambilCatatanPemeriksaan(id), []);
});

// Langkah 6 sampai 9 Basic Path dan Exception Path 1: control memvalidasi isian lalu menyimpan catatan (REQ-5.3, REQ-5.4).
tombol('Simpan Catatan', async function () {
  try {
    const hasil = await controllerDetail(this).simpanCatatanPemeriksaan(this.uc05.id, this.isian['Catatan Pemeriksaan'] ?? '');
    this.pesan = hasil.pesan;
  } catch (e) {
    this.pesan = e.message;
  }
});
