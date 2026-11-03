import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samarkanNomorTelepon } from './penelepon.ts';
// Hanya di tes: aturan gateway yang menerbitkan tiket ESK/ADU dari ucapan, untuk membuktikan penyamaran tidak lebih sempit.
import { nomorTeleponDariUcapan } from '../../../../voice-gateway/eskalasi.mjs';

test('nfr_13 nomor telepon dalam teks ucapan disamarkan seperti 0812****7890', () => {
  for (const [masuk, keluar] of [
    ['081234567890', '0812****7890'],
    ['Nomor saya 0812 3456 7890 ya.', 'Nomor saya 0812****7890 ya.'],
    ['nomor hp saya 0812-3456-7890', 'nomor hp saya 0812****7890'],
    ['+62 812 3456 7890', '0812****7890'],
    ['62812345678901', '0812*****8901'],
    ['nol delapan satu dua tiga empat lima enam tujuh delapan sembilan nol', '0812****7890'],
    ['Plus enam dua delapan satu dua, tiga empat lima enam, tujuh delapan sembilan nol', '0812****7890'],
    ['saya beli 2, 0812 3456 7890', 'saya beli 2, 0812****7890'],
    ['0812345678', '0812**5678'],
    // Ragu di tengah nomor dan tanda baca dari STT: aturan sama dengan nomorTeleponDariUcapan di gateway.
    ['nol delapan satu dua ee tiga empat lima enam tujuh delapan sembilan nol', '0812****7890'],
    ['Nomor saya 0812, eh, 3456 7890.', 'Nomor saya 0812****7890.'],
    ['nol delapan satu dua, maaf, tiga empat lima enam tujuh delapan sembilan nol', '0812****7890'],
    ['(0812) 3456 7890', '(0812****7890'],
    ['nomor saya 0812/3456/7890 ya', 'nomor saya 0812****7890 ya'],
    ['saya beli 2 botol, nomor saya nol delapan satu dua ee tiga empat lima enam tujuh delapan sembilan nol', 'saya beli 2 botol, nomor saya 0812****7890'],
    // Angka sesudah nomor bukan bagian nomor.
    ['0812 3456 7890, 2 botol', '0812****7890, 2 botol'],
    ['nomor 0812 3456 7890 tiga kali', 'nomor 0812****7890 tiga kali'],
    ['0812 3456 78 90 ya', '0812****7890 ya'],
    ['0812345678901234', '0812********1234'],
  ]) {
    assert.equal(samarkanNomorTelepon(masuk), keluar, masuk);
  }
});

test('nfr_13 penyamaran tidak mengubah nomor tiket, nomor izin edar, dan angka lain', () => {
  for (const teks of [
    'Nomor tiket Anda ESK-20261019-0001. Jawaban petugas akan dikirim melalui SMS.',
    'Pengaduan Anda telah dicatat dengan nomor tiket ADU-20261108-0812.',
    'Susu Formula Sehat terdaftar dengan nomor izin edar BPOM RI MD 865009001234, status izin Berlaku.',
    'Nomor izin edar DBL0812345678A1 di kemasan.',
    'Saya minum dua tablet jam 08.30, sudah satu minggu.',
    'Kesatuan dua-duanya tujuh belas.',
  ]) {
    assert.equal(samarkanNomorTelepon(teks), teks, teks);
  }
});

test('nfr_13 nomor yang dikenali gateway untuk tiket tidak bisa dikenali lagi dari teks yang disimpan', () => {
  for (const ucapan of [
    'nol delapan satu dua ee tiga empat lima enam tujuh delapan sembilan nol',
    'nol delapan satu dua, eh, tiga empat lima enam, tujuh delapan sembilan nol',
    'kosong delapan satu dua sebentar ya tiga empat lima enam tujuh delapan sembilan kosong',
    '(0812) 3456 7890',
    '0812/3456/7890',
    '+62 (812) 3456-7890',
    'plus enam dua delapan satu dua tiga empat lima enam tujuh delapan sembilan nol',
    'nomor saya 0812 3456 7890 2',
  ]) {
    assert.ok(nomorTeleponDariUcapan(ucapan), ucapan);
    assert.equal(nomorTeleponDariUcapan(samarkanNomorTelepon(ucapan)), null, ucapan);
  }
});
