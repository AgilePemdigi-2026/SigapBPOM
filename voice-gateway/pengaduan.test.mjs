import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EkstraktorAturan, FIELD_PENGADUAN, JENIS_INTERAKSI, PESAN_MINTA_NOMOR_TELEPON, PROMPT_DATA_KURANG, PengaduanController, validasiNomorTelepon,
} from './pengaduan.mjs';
import { PESAN_LAYANAN_1, PESAN_LAYANAN_2, RiwayatPanggilan, pilihMenu } from './percakapan.mjs';

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const ekstrak = (u, ditanya = null, data = {}) => new EkstraktorAturan().ekstrak(u, { ditanya, data });

test('req_2_1 pilihan 2 menandai percakapan pengaduan dan memutar prompt data pengaduan', () => {
  const riwayat = new RiwayatPanggilan();
  const pengaduan = new PengaduanController();
  const hasil = pilihMenu(riwayat, pengaduan, ID, 2);
  assert.equal(hasil.jawaban, 'Silakan sebutkan nama produk, kronologi kejadian, nama, dan nomor telepon Anda.');
  assert.equal(hasil.jawaban, PESAN_LAYANAN_2);
  assert.equal(hasil.suara, '/voice/statis/layanan-2');
  assert.equal(riwayat.jenisInteraksi(ID), JENIS_INTERAKSI.PENGADUAN);
  assert.equal(riwayat.layanan(ID), 2);
  assert.ok(pengaduan.aktif(ID));
});

test('req_1_1 pilihan 1 tetap alur UC-01 dan tidak memulai pengaduan', () => {
  const riwayat = new RiwayatPanggilan();
  const pengaduan = new PengaduanController();
  const hasil = pilihMenu(riwayat, pengaduan, ID, 1);
  assert.equal(hasil.jawaban, PESAN_LAYANAN_1);
  assert.equal(hasil.suara, '/voice/statis/layanan-1');
  assert.equal(riwayat.jenisInteraksi(ID), JENIS_INTERAKSI.INFORMASI_PRODUK);
  assert.ok(!pengaduan.aktif(ID));
});

test('req_2_1 pindah dari pengaduan ke informasi produk membuang alur pengaduan', () => {
  const riwayat = new RiwayatPanggilan();
  const pengaduan = new PengaduanController();
  pilihMenu(riwayat, pengaduan, ID, 2);
  pilihMenu(riwayat, pengaduan, ID, 1);
  assert.ok(!pengaduan.aktif(ID));
  assert.equal(riwayat.jenisInteraksi(ID), JENIS_INTERAKSI.INFORMASI_PRODUK);
});

test('req_2_1 pilihan tidak dikenal ditolak tanpa mengubah percakapan', () => {
  const riwayat = new RiwayatPanggilan();
  const pengaduan = new PengaduanController();
  for (const n of [0, 3, NaN, undefined]) assert.equal(pilihMenu(riwayat, pengaduan, ID, n), null);
  assert.equal(riwayat.jenisInteraksi(ID), null);
  assert.ok(!pengaduan.aktif(ID));
});

// T-F4.1-02: ekstraksi dan tanya ulang data pengaduan (REQ-2.2)

test('req_2_2 satu ucapan memuat keempat data wajib', () => {
  const h = ekstrak('Saya membeli Sirup Batuk Sehat kemarin, setelah diminum anak saya demam dan muncul ruam. Nama saya Ahmad Fauzi, nomor telepon saya 0812 3456 7890.');
  assert.equal(h.namaProduk, 'Sirup Batuk Sehat');
  assert.equal(h.kronologi, 'setelah diminum anak saya demam dan muncul ruam');
  assert.equal(h.namaPelapor, 'Ahmad Fauzi');
  assert.equal(h.nomorTelepon, '081234567890');
});

test('req_2_2 data sebagian hanya mengisi yang disebutkan', () => {
  const h = ekstrak('Nama produknya Krim Glowing Ajaib. Atas nama Siti Aminah.');
  assert.deepEqual(h, { namaProduk: 'Krim Glowing Ajaib', namaPelapor: 'Siti Aminah' });
});

test('req_2_2 nomor telepon diterima dalam bentuk angka, +62, dan kata', () => {
  assert.equal(ekstrak('nomor saya 0812-3456-7890').nomorTelepon, '081234567890');
  assert.equal(ekstrak('+62 812 3456 7890').nomorTelepon, '081234567890');
  assert.equal(ekstrak('nol delapan satu dua tiga empat lima enam tujuh delapan sembilan nol').nomorTelepon, '081234567890');
});

test('req_2_2 validasi format nomor telepon Indonesia', () => {
  assert.equal(validasiNomorTelepon('0812 3456 7890'), '081234567890');
  assert.equal(validasiNomorTelepon('+6281234567890'), '081234567890');
  assert.equal(validasiNomorTelepon('6281234567890'), '081234567890');
  for (const n of ['12345', '0812', '02112345678', '081234567890123', '', null, 'abc']) assert.equal(validasiNomorTelepon(n), null, String(n));
  assert.deepEqual(ekstrak('nomor saya 08123456'), {});
});

test('req_2_2 jawaban singkat atas pertanyaan tanya ulang diterima apa adanya', () => {
  assert.equal(ekstrak('Budi Santoso', 'namaPelapor').namaPelapor, 'Budi Santoso');
  assert.equal(ekstrak('Nama saya Budi', 'namaPelapor').namaPelapor, 'Budi');
  assert.equal(ekstrak('Obat Flu Cepat Sembuh', 'namaProduk').namaProduk, 'Obat Flu Cepat Sembuh');
  assert.equal(ekstrak('Perut saya mual dan pusing setelah minum obatnya', 'kronologi').kronologi, 'Perut saya mual dan pusing setelah minum obatnya');
});

test('req_2_2 ucapan tanpa isi tidak mengisi data yang ditanyakan', () => {
  for (const f of FIELD_PENGADUAN) assert.deepEqual(ekstrak('iya', f), {}, f);
  assert.deepEqual(ekstrak('hmm', 'kronologi'), {});
  assert.deepEqual(ekstrak('ya sudah', 'namaPelapor'), {});
});

test('req_2_2 data lain dalam ucapan tidak dianggap jawaban atas data yang ditanyakan', () => {
  assert.deepEqual(ekstrak('Nama saya Budi Santoso', 'kronologi'), { namaPelapor: 'Budi Santoso' });
});

test('req_2_2 prompt tanya ulang per data, nomor telepon persis kamus Lampiran A', () => {
  assert.equal(PESAN_MINTA_NOMOR_TELEPON, 'Mohon sebutkan nomor telepon Anda.');
  assert.equal(PROMPT_DATA_KURANG.nomorTelepon.pesan, 'Mohon sebutkan nomor telepon Anda.');
  assert.deepEqual(Object.keys(PROMPT_DATA_KURANG), FIELD_PENGADUAN);
});

test('req_2_2 data tidak lengkap hanya memicu tanya ulang untuk data yang kurang', async () => {
  const c = new PengaduanController();
  c.mulai(ID);
  let h = await c.tangani(ID, 'Saya beli Sirup Batuk Sehat kemarin, setelah diminum anak saya demam dan muncul ruam.');
  assert.equal(h.lengkap, false);
  assert.deepEqual(h.kurang, ['namaPelapor', 'nomorTelepon']);
  assert.equal(h.jawaban, PROMPT_DATA_KURANG.namaPelapor.pesan);
  h = await c.tangani(ID, 'Ahmad Fauzi');
  assert.deepEqual(h.kurang, ['nomorTelepon']);
  assert.equal(h.jawaban, 'Mohon sebutkan nomor telepon Anda.');
  assert.equal(h.suara, 'ulang-telepon');
  // Nomor tidak valid: tetap hanya nomor yang ditanyakan ulang, data lain tidak hilang.
  h = await c.tangani(ID, 'nomor saya 0812345');
  assert.deepEqual(h.kurang, ['nomorTelepon']);
  assert.equal(h.jawaban, 'Mohon sebutkan nomor telepon Anda.');
});

test('req_2_2 data lengkap lanjut ke penerbitan tiket tanpa tanya ulang', async () => {
  const c = new PengaduanController();
  c.mulai(ID);
  await c.tangani(ID, 'Nama produknya Sirup Batuk Sehat. Setelah diminum anak saya demam dan muncul ruam.');
  await c.tangani(ID, 'Ahmad Fauzi');
  const h = await c.tangani(ID, '0812 3456 7890');
  assert.equal(h.lengkap, true);
  assert.deepEqual(h.data, {
    namaProduk: 'Sirup Batuk Sehat', kronologi: 'Setelah diminum anak saya demam dan muncul ruam', namaPelapor: 'Ahmad Fauzi', nomorTelepon: '081234567890',
  });
});

test('req_2_2 ekstraktor lain bisa dipasang lewat interface', async () => {
  const c = new PengaduanController({ ekstraktor: { ekstrak: async () => ({ namaProduk: 'A', kronologi: 'b c d', namaPelapor: 'E', nomorTelepon: '+6281234567890' }) } });
  c.mulai(ID);
  const h = await c.tangani(ID, 'apa saja');
  assert.equal(h.lengkap, true);
  assert.equal(h.data.nomorTelepon, '081234567890');
});
