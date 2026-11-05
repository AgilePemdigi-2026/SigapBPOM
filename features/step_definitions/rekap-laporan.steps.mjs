// Langkah Gherkin UC-08 Merekap dan Mengunduh Laporan Layanan. Rekap dan hak ekspor memakai LaporanController dengan
// PenyimpananLaporanTiruan, seperti halaman /rekap-laporan tanpa sesi Supabase. GrafikRekapitulasi, TabelRekapitulasi,
// dan kartu total (Lampiran B, SRS 3.1.12) diperiksa dari rekap yang disiapkan control untuk ketiganya.
import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { LaporanController, daftarPeriode } from '../../src/lib/LaporanController.ts';
import { PenyimpananLaporanTiruan } from '../../src/lib/mock/laporanTiruan.ts';
import { tombol } from '../support/dashboard.mjs';

// Pilihan periode disusun pada 20 Oktober 2026 WIB, sesudah periode contoh SRS September 2026.
const SEKARANG = new Date('2026-10-20T10:00:00+07:00');
const KOLOM = ['panggilan', 'tereskalasi', 'pengaduanSelesai'];

function uc08(dunia) {
  dunia.uc08 ??= { hakEkspor: true };
  dunia.uc08.laporan ??= new LaporanController(new PenyimpananLaporanTiruan({ hakEkspor: dunia.uc08.hakEkspor }));
  return dunia.uc08;
}

const rekap = (dunia) => {
  const r = uc08(dunia).rekap;
  assert.ok(r && !('kosong' in r), 'rekapitulasi tidak ditampilkan');
  return r;
};

// Langkah 1 dan 2 Basic Path.
function bukaHalaman(dunia) {
  uc08(dunia).pilihanPeriode = daftarPeriode(SEKARANG);
  dunia.halaman = '/rekap-laporan';
}

Given('petugas yang masuk tidak memiliki hak akses ekspor data', function () {
  assert.equal(this.uc08?.laporan, undefined, 'hak ekspor harus diatur sebelum halaman dibuka');
  this.uc08 = { hakEkspor: false };
});

Given('rekapitulasi layanan periode {string} sudah ditampilkan', async function (label) {
  bukaHalaman(this);
  this.isian.Periode = label;
  await aksiTampilkan.call(this);
  rekap(this);
});

When('petugas membuka halaman rekap dan laporan', function () {
  bukaHalaman(this);
});

Then('pilihan {string} memuat {string} dan {string}', function (field, a, b) {
  assert.equal(field, 'Periode');
  const label = uc08(this).pilihanPeriode.map((p) => p.label);
  for (const l of [a, b]) assert.ok(label.includes(l), `pilihan Periode tanpa "${l}"`);
});

Then('TabelRekapitulasi menampilkan rekap per minggu:', function (tabel) {
  const { perMinggu } = rekap(this);
  assert.deepEqual(perMinggu.map(({ awal, akhir }) => ({ awal, akhir })), tabel.hashes());
  for (const m of perMinggu) for (const k of KOLOM) assert.ok(Number.isInteger(m[k]) && m[k] >= 0, `${k} minggu ${m.awal}`);
});

Then('GrafikRekapitulasi menampilkan jumlah panggilan, kasus tereskalasi, dan pengaduan selesai setiap minggu', function () {
  const { perMinggu } = rekap(this);
  assert.ok(perMinggu.length > 0);
  for (const k of KOLOM) assert.ok(perMinggu.some((m) => m[k] > 0), `grafik ${k} kosong`);
});

// REQ-8.1: total periode sama dengan jumlah rincian mingguan.
Then('kartu total menampilkan jumlah panggilan, kasus tereskalasi, dan pengaduan selesai selama periode', function () {
  const { total, perMinggu } = rekap(this);
  for (const k of KOLOM) assert.equal(total[k], perMinggu.reduce((n, m) => n + m[k], 0), `kartu ${k}`);
  assert.ok(total.panggilan > 0);
});

Then('TabelRekapitulasi dan GrafikRekapitulasi tidak ditampilkan', function () {
  assert.ok('kosong' in uc08(this).rekap);
});

Then('PilihanFormatBerkas ditampilkan', function () {
  assert.equal(uc08(this).pilihanFormat, true);
});

Then('PilihanFormatBerkas tidak ditampilkan', function () {
  assert.equal(uc08(this).pilihanFormat, false);
});

Then('tidak ada pesan penolakan', function () {
  assert.equal(this.pesan, null);
});

// @belum-tersedia: berkas laporan disusun GET /api/laporan (T-F8.2-01).
Then('berkas laporan PDF periode {string} tersusun', function (_periode) {
  return 'pending';
});

// Langkah 4 sampai 6 Basic Path dan Alternative Path 1 (REQ-8.1, REQ-8.2).
async function aksiTampilkan() {
  const d = uc08(this);
  const periode = d.pilihanPeriode.find((p) => p.label === this.isian.Periode);
  assert.ok(periode, `periode "${this.isian.Periode}" tidak ada di pilihan`);
  d.rekap = await d.laporan.hitungRekap({ awal: periode.awal, akhir: periode.akhir });
  this.pesan = 'kosong' in d.rekap ? d.rekap.kosong : null;
}
tombol('Tampilkan', aksiTampilkan);

// Langkah 7 dan 8 Basic Path dan Exception Path 1: hak ekspor diperiksa sebelum pilihan format ditampilkan (REQ-8.3, BR-8).
tombol('Unduh Laporan', async function () {
  const d = uc08(this);
  const hak = await d.laporan.periksaHakEkspor();
  d.pilihanFormat = hak.boleh;
  this.pesan = hak.boleh ? null : hak.pesan;
});

// Langkah 9 sampai 12 Basic Path menunggu GET /api/laporan (T-F8.2-01).
tombol('Konfirmasi Unduh', function () {
  return 'pending';
});
