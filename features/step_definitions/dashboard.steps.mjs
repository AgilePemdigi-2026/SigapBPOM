// Langkah bersama skenario control dashboard Sprint 3 (UC-05, UC-06, UC-08): mengisi field, memilih opsi, menekan tombol,
// dan memeriksa pesan kamus Lampiran A. Aksi tiap tombol didaftarkan file langkah UC lewat features/support/dashboard.mjs.
import assert from 'node:assert/strict';
import { Before, Given, When, Then } from '@cucumber/cucumber';
import { aksiUntuk } from '../support/dashboard.mjs';

Before(function () {
  this.isian = {};
  this.pesan = null;
  this.halaman = null;
});

// Prasyarat SRS Tabel 4.5, 4.6, dan 4.8. Sesi dan middleware diuji di UC-03; di sini control dipanggil langsung.
Given('petugas sudah masuk ke dashboard SIGAP', function () {});

When('petugas mengisi {string} dengan {string}', function (field, nilai) {
  this.isian[field] = nilai;
});

When('petugas memilih {string} pada pilihan {string}', function (opsi, field) {
  this.isian[field] = opsi;
});

When('petugas menekan {string}', function (label) {
  return aksiUntuk(label).call(this);
});

Then('halaman {string} terbuka', function (path) {
  assert.equal(this.halaman, path);
});

Then('sistem menampilkan pesan {string}', function (pesan) {
  assert.equal(this.pesan, pesan);
});
