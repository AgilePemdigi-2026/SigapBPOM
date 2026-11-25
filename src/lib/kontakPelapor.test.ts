import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomorInternasional, tampilNomor, tautanTelepon, tautanWhatsApp, teksWhatsApp } from './kontakPelapor.ts';

test('adr_0006 nomor ponsel Indonesia dinormalkan ke 62…, nomor lain ditolak', () => {
  assert.equal(nomorInternasional('081234567890'), '6281234567890');
  assert.equal(nomorInternasional('+62 812-3456-7890'), '6281234567890');
  assert.equal(nomorInternasional('6281234567890'), '6281234567890');
  assert.equal(nomorInternasional('0215551234'), null);
  assert.equal(nomorInternasional('0812****7890'), null);
  assert.equal(nomorInternasional(null), null);
});

test('adr_0006 nomor tampil dikelompokkan, nomor tidak sah apa adanya', () => {
  assert.equal(tampilNomor('081234567890'), '0812-3456-7890');
  assert.equal(tampilNomor('08123456789'), '0812-3456-789');
  assert.equal(tampilNomor('0812****7890'), '0812****7890');
  assert.equal(tampilNomor(null), '—');
});

test('adr_0006 tautan wa.me membawa teks ter-encode dan tel: memakai +62', () => {
  assert.equal(tautanWhatsApp('081234567890', 'Halo & terima kasih'), 'https://wa.me/6281234567890?text=Halo%20%26%20terima%20kasih');
  assert.equal(tautanTelepon('081234567890'), 'tel:+6281234567890');
  assert.equal(tautanWhatsApp('0812****7890', 'x'), null);
  assert.equal(tautanTelepon(''), null);
});

test('req_6_6 pesan tindak lanjut pengaduan selesai memuat nomor tiket dan tanggapan resmi utuh', () => {
  const teks = teksWhatsApp({ jenis: 'pengaduan', noTiket: 'ADU-20261124-0001', kirimTanggapan: true, tanggapan: ' Produk sudah ditarik dari peredaran. ' });
  assert.ok(teks.includes('ADU-20261124-0001 telah selesai ditindaklanjuti'));
  assert.ok(teks.includes('Tanggapan resmi:\nProduk sudah ditarik dari peredaran.\n'));
});

test('adr_0006 nama petugas yang masuk dipakai sebagai salam pembuka', () => {
  assert.ok(teksWhatsApp({ jenis: 'eskalasi', noTiket: 'ESK-20261124-0002', kirimTanggapan: false, petugas: ' Adrian ' })
    .startsWith('Halo, saya Adrian dari HaloBPOM, menindaklanjuti pertanyaan Anda'));
  assert.ok(teksWhatsApp({ jenis: 'pengaduan', noTiket: 'ADU-20261124-0001', kirimTanggapan: true, tanggapan: 'x', petugas: 'Abin' })
    .startsWith('Halo, saya Abin dari HaloBPOM. Pengaduan Anda'));
});

test('adr_0006 pengaduan belum selesai dan eskalasi hanya membawa pembuka dengan nomor tiket', () => {
  assert.equal(teksWhatsApp({ jenis: 'pengaduan', noTiket: 'ADU-20261124-0001', kirimTanggapan: false, tanggapan: 'x' }),
    'Halo, kami dari HaloBPOM, terkait pengaduan Anda dengan nomor tiket ADU-20261124-0001.\n\n');
  assert.equal(teksWhatsApp({ jenis: 'pengaduan', noTiket: 'ADU-20261124-0001', kirimTanggapan: true, tanggapan: ' ' }),
    'Halo, kami dari HaloBPOM, terkait pengaduan Anda dengan nomor tiket ADU-20261124-0001.\n\n');
  assert.equal(teksWhatsApp({ jenis: 'eskalasi', noTiket: 'ESK-20261124-0002', kirimTanggapan: false }),
    'Halo, kami dari HaloBPOM, menindaklanjuti pertanyaan Anda dengan nomor tiket ESK-20261124-0002.\n\n');
});
