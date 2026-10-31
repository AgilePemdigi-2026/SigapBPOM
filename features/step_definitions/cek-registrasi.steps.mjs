// Langkah Gherkin UC-01 cek registrasi. cekbpom diganti server tiruan yang meniru antarmuka /all-produk dan
// /produk-dt/all, kecuali skenario @live yang memakai situs asli.
import assert from 'node:assert/strict';
import { Given, When, Then, Before } from '@cucumber/cucumber';
import { CekBpom, cekRegistrasi } from '../../voice-gateway/cekbpom.mjs';
import { PESAN_LAYANAN_1 } from '../../voice-gateway/percakapan.mjs';

Before(function () {
  this.data = [];
  this.pencarian = [];
  this.gangguan = false;
  this.setelahMenu1 = false;
  this.asli = false;
});

// Meniru filter cekbpom: kolom yang diisi dicocokkan sebagai substring tanpa membedakan huruf besar.
function cekbpomTiruan(dunia) {
  return async (url, opsi = {}) => {
    if (dunia.gangguan) throw new Error('cekbpom tidak terjangkau');
    if (url.endsWith('/all-produk')) {
      return new Response('<meta name="csrf-token" content="tok">', { headers: { 'set-cookie': 'sesi=1; Path=/' } });
    }
    const f = new URLSearchParams(opsi.body);
    dunia.pencarian.push(Object.fromEntries([...f].filter(([k, v]) => v && k.startsWith('product_'))));
    const cocok = (isi, cari) => !cari || isi.toLowerCase().includes(cari.toLowerCase());
    const baris = dunia.data.filter((d) =>
      cocok(d.nama, f.get('product_name')) && cocok(d.merek, f.get('product_brand')) && cocok(d.nomor, f.get('product_register')));
    return Response.json({
      recordsFiltered: baris.length,
      data: baris.map((d) => ({ PRODUCT_NAME: d.nama, PRODUCT_BRANDS: d.merek, PRODUCT_REGISTER: d.nomor, STATUS: d.status, REGISTRAR: d.pendaftar })),
    });
  };
}

Given('data registrasi cekbpom berisi:', function (tabel) {
  this.data = tabel.hashes();
});
Given('penelepon sudah memilih menu {int}', function (menu) {
  this.setelahMenu1 = menu === 1;
  assert.ok(PESAN_LAYANAN_1);
});
Given('cekbpom sedang gangguan', function () {
  this.gangguan = true;
});
Given('cekbpom yang dipakai adalah situs asli', function () {
  this.asli = true;
});

When('penelepon berkata {string}', async function (ucapan) {
  const cek = this.asli ? new CekBpom() : new CekBpom({ fetch: cekbpomTiruan(this) });
  this.hasil = await cekRegistrasi(cek, ucapan, this.setelahMenu1);
});

Then('cekbpom dicari dengan nama {string}', function (nama) {
  assert.deepEqual(this.hasil.kueri, { nama });
  assert.ok(this.pencarian.some((p) => p.product_name === nama), 'dicari per nama produk');
});
Then('cekbpom dicari dengan nomor {string}', function (nomor) {
  assert.deepEqual(this.hasil.kueri, { nomor });
  assert.deepEqual(this.pencarian, [{ product_register: nomor }]);
});
Then('cekbpom tidak dipanggil', function () {
  assert.equal(this.hasil, null);
  assert.equal(this.pencarian.length, 0);
});

Then('kartu produk menampilkan nomor izin edar {string} dengan status {string}', function (nomor, status) {
  const { produk } = this.hasil;
  assert.equal(produk?.jenis, 'tunggal', `kartu ${produk?.jenis}`);
  assert.equal(produk.produk.nomorIzinEdar, nomor);
  assert.equal(produk.produk.status, status);
  assert.equal(produk.produk.sumber, 'cekbpom.pom.go.id');
});
Then('kartu produk berisi {int} kandidat', function (n) {
  assert.equal(this.hasil.produk.jenis, 'kandidat');
  assert.equal(this.hasil.produk.produk.length, n);
});
Then('kartu produk menyatakan tidak ditemukan', function () {
  assert.equal(this.hasil.produk.jenis, 'tidak_ditemukan');
});
Then('tidak ada kartu produk', function () {
  assert.equal(this.hasil.produk, undefined);
  assert.ok(this.hasil.galat);
});

Then('pesan untuk AI memuat {string}', function (teks) {
  assert.ok(this.hasil.konteks.includes(teks), this.hasil.konteks);
});
Then('pesan untuk AI meminta nama yang lebih lengkap atau nomor izin edar', function () {
  assert.match(this.hasil.konteks, /nama yang lebih lengkap atau nomor izin edar/);
});
Then('pesan untuk AI tidak memuat status registrasi apa pun', function () {
  assert.doesNotMatch(this.hasil.konteks, /status (Berlaku|Tidak Berlaku|Dibatalkan)/);
  assert.match(this.hasil.konteks, /Jangan menyimpulkan produk itu ilegal/);
});
Then('pesan untuk AI menawarkan tekan {int} untuk pengaduan', function (n) {
  assert.match(this.hasil.konteks, new RegExp(`tekan ${n} untuk pengaduan`));
});
Then('pesan untuk AI melarang menyebut status atau nomor izin edar', function () {
  assert.match(this.hasil.konteks, /Jangan menyebut status atau nomor izin edar apa pun/);
});
