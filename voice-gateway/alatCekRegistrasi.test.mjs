import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BATAS_ULANG_NAMA, DEFINISI_TOOL, NAMA_TOOL, PESAN_BATAS_ULANG_NAMA, PESAN_NAMA_TIDAK_JELAS, PESAN_TIDAK_DITEMUKAN, cekRegistrasiBpom,
  nomorPilihan, pesanProdukDitemukan,
} from './alatCekRegistrasi.mjs';
import { PESAN_LAYANAN_1, PESAN_TAWARAN_PENUTUP } from './percakapan.mjs';

// Data contoh sama dengan PRODUK_TIRUAN di src/lib/mock/transkripTiruan.ts.
const PRODUK = [
  { nama: 'Susu Formula Sehat', merek: 'Sehat', nomorIzinEdar: 'BPOM RI MD 865009001234', status: 'Berlaku', pendaftar: 'PT Nutrisi Sehat Indonesia', berlakuSampai: '', sumber: 'cekbpom.pom.go.id' },
  { nama: 'Paracetamol 500 mg Tablet', merek: 'Paracetamol', nomorIzinEdar: 'DBL1234567810A1', status: 'Berlaku', pendaftar: 'PT Farma Nusantara', berlakuSampai: '', sumber: 'cekbpom.pom.go.id' },
  { nama: 'Paracetamol Sirup Anak', merek: 'Paracetamol', nomorIzinEdar: 'DBL1234567837A1', status: 'Berlaku', pendaftar: 'PT Farma Nusantara', berlakuSampai: '', sumber: 'cekbpom.pom.go.id' },
  { nama: 'Paracetamol Kaplet Forte', merek: 'Paracetamol', nomorIzinEdar: 'DBL1234567904A1', status: 'Tidak Berlaku', pendaftar: 'PT Medika Prima', berlakuSampai: '', sumber: 'cekbpom.pom.go.id' },
  { nama: 'Paracetamol Drop Bayi', merek: 'Paracetamol', nomorIzinEdar: 'DBL1234567911A1', status: 'Berlaku', pendaftar: 'PT Medika Prima', berlakuSampai: '', sumber: 'cekbpom.pom.go.id' },
];

/** Adapter cekbpom tiruan dengan interface yang sama dengan CekBpom: `cari(kueri)` -> `{ total, produk }`. */
class CekBpomTiruan {
  constructor(data = PRODUK, { gangguan = false } = {}) {
    this.data = data;
    this.gangguan = gangguan;
    this.kueri = [];
  }

  async cari(kueri) {
    this.kueri.push(kueri);
    if (this.gangguan) throw new Error('cekbpom tidak terjangkau');
    const produk = this.data.filter((p) => (kueri.nomor ? p.nomorIzinEdar.endsWith(kueri.nomor) : p.nama.toLowerCase().includes(kueri.nama)));
    return { total: produk.length, produk: produk.slice(0, 10) };
  }
}

const SETELAH_MENU_1 = { jawabanTerakhir: PESAN_LAYANAN_1 };

test('t_f1_2_03 definisi tool bernama cek_registrasi_bpom dengan parameter nama produk atau nomor izin edar', () => {
  assert.equal(NAMA_TOOL, 'cek_registrasi_bpom');
  assert.equal(DEFINISI_TOOL.function.name, 'cek_registrasi_bpom');
  assert.deepEqual(Object.keys(DEFINISI_TOOL.function.parameters.properties), ['nama_produk', 'nomor_izin_edar']);
});

test('t_f1_2_03 hasil tunggal: "Susu Formula Sehat" dibacakan dengan kalimat baku tanpa AI', async () => {
  const cek = new CekBpomTiruan();
  const hasil = await cekRegistrasiBpom(cek, 'Susu Formula Sehat', SETELAH_MENU_1);
  assert.equal(hasil.jalur, 'tunggal');
  assert.ok(hasil.jawaban.startsWith('Susu Formula Sehat terdaftar dengan nomor izin edar BPOM RI MD 865009001234, status izin Berlaku.'), hasil.jawaban);
  assert.ok(hasil.jawaban.endsWith(PESAN_TAWARAN_PENUTUP));
  assert.equal(hasil.konteks, null, 'tidak ada pesan untuk AI');
  assert.equal(hasil.produk.jenis, 'tunggal');
  assert.equal(hasil.produk.produk.nomorIzinEdar, 'BPOM RI MD 865009001234');
  assert.deepEqual(cek.kueri, [{ nama: 'susu formula sehat' }]);
});

test('t_f1_2_03 kalimat produk ditemukan mengikuti kamus pesan Lampiran A', () => {
  assert.equal(pesanProdukDitemukan(PRODUK[3]), 'Paracetamol Kaplet Forte terdaftar dengan nomor izin edar DBL1234567904A1, status izin Tidak Berlaku.');
});

test('req_1_5 hasil ganda: jumlah dan paling banyak tiga kandidat dibacakan Hermes, lalu penelepon memilih nomornya', async () => {
  const cek = new CekBpomTiruan();
  const ganda = await cekRegistrasiBpom(cek, 'Apakah paracetamol sudah terdaftar di BPOM?');
  assert.equal(ganda.jalur, 'ganda');
  assert.equal(ganda.jawaban, null, 'dibacakan AI dari pesan sistem');
  assert.match(ganda.konteks, /^Hasil pencarian data registrasi BPOM/);
  assert.match(ganda.konteks, /Ada 4 produk yang cocok/);
  assert.match(ganda.konteks, /nomor pilihannya/);
  assert.ok(!ganda.konteks.includes('Paracetamol Drop Bayi'), 'kandidat keempat tidak disebut (BR-7)');
  assert.equal(ganda.produk.jenis, 'kandidat');
  assert.equal(ganda.produk.produk.length, 3);
  assert.equal(ganda.keadaan.kandidat.length, 3);

  const pilih = await cekRegistrasiBpom(cek, 'yang nomor dua', { ...ganda.keadaan, jawabanTerakhir: 'Ada empat produk paracetamol.' });
  assert.equal(pilih.jalur, 'tunggal');
  assert.ok(pilih.jawaban.startsWith('Paracetamol Sirup Anak terdaftar dengan nomor izin edar DBL1234567837A1, status izin Berlaku.'));
  assert.equal(pilih.produk.produk.nama, 'Paracetamol Sirup Anak');
  assert.equal(pilih.keadaan.kandidat, null);
  assert.equal(cek.kueri.length, 1, 'pilihan diambil dari kandidat tanpa memanggil cekbpom lagi');
});

test('req_1_5 nomor pilihan dikenali dari kata atau angka, di luar jumlah kandidat ditolak', () => {
  assert.equal(nomorPilihan('nomor dua', 3), 2);
  assert.equal(nomorPilihan('yang ketiga saja', 3), 3);
  assert.equal(nomorPilihan('Pertama.', 3), 1);
  assert.equal(nomorPilihan('2', 3), 2);
  assert.equal(nomorPilihan('nomor tiga', 2), null);
  assert.equal(nomorPilihan('saya punya dua anak yang demam', 3), null);
  assert.equal(nomorPilihan('Paracetamol sirup', 3), null);
});

test('t_f1_2_03 hasil kosong: pesan baku tidak ditemukan tanpa AI dan tanpa status apa pun (NFR-7)', async () => {
  const hasil = await cekRegistrasiBpom(new CekBpomTiruan(), 'Apakah krim glowing ajaib terdaftar di BPOM?');
  assert.equal(hasil.jalur, 'tidak_ditemukan');
  assert.equal(hasil.jawaban, PESAN_TIDAK_DITEMUKAN);
  assert.equal(PESAN_TIDAK_DITEMUKAN, 'Produk tidak ditemukan pada data registrasi BPOM. Tekan 2 untuk menyampaikan pengaduan.');
  assert.equal(hasil.konteks, null);
  assert.equal(hasil.produk.jenis, 'tidak_ditemukan');
});

test('br_6 nama tidak jelas diminta ulang paling banyak dua kali, lalu tidak diminta lagi', async () => {
  const cek = new CekBpomTiruan();
  let keadaan = { ulangNama: 0, kandidat: null, jawabanTerakhir: PESAN_LAYANAN_1 };
  for (const ucapan of ['Apakah sudah terdaftar di BPOM?', 'eh itu']) {
    const hasil = await cekRegistrasiBpom(cek, ucapan, keadaan);
    assert.equal(hasil.jalur, 'tidak_jelas', ucapan);
    assert.equal(hasil.jawaban, 'Maaf, nama produk kurang jelas. Mohon sebutkan kembali.');
    assert.equal(hasil.produk, undefined);
    keadaan = { ...hasil.keadaan, jawabanTerakhir: PESAN_NAMA_TIDAK_JELAS };
  }
  assert.equal(keadaan.ulangNama, BATAS_ULANG_NAMA);

  const ketiga = await cekRegistrasiBpom(cek, 'itu tuh', keadaan);
  assert.equal(ketiga.jalur, 'batas_ulang');
  assert.equal(ketiga.jawaban, null, 'tidak ada permintaan ulang ketiga');
  assert.equal(ketiga.konteks, PESAN_BATAS_ULANG_NAMA);
  assert.match(ketiga.konteks, /Jangan meminta nama produk lagi/);
  assert.equal(cek.kueri.length, 0, 'cekbpom tidak dipanggil untuk nama yang tidak jelas');
});

test('br_6 nama yang akhirnya jelas setelah diminta ulang dicari dan hitungan ulang kembali nol', async () => {
  const hasil = await cekRegistrasiBpom(new CekBpomTiruan(), 'susu formula sehat', { ulangNama: 1, kandidat: null, jawabanTerakhir: PESAN_NAMA_TIDAK_JELAS });
  assert.equal(hasil.jalur, 'tunggal');
  assert.equal(hasil.keadaan.ulangNama, 0);
});

test('nfr_7 cekbpom gangguan: Hermes dilarang menyebut status, tanpa kartu', async () => {
  const hasil = await cekRegistrasiBpom(new CekBpomTiruan(PRODUK, { gangguan: true }), 'Apakah Susu Formula Sehat terdaftar?');
  assert.equal(hasil.jalur, 'gagal');
  assert.equal(hasil.jawaban, null);
  assert.match(hasil.konteks, /Jangan menyebut status atau nomor izin edar apa pun/);
  assert.equal(hasil.produk, undefined);
  assert.ok(hasil.galat);
});

test('t_f1_2_03 ucapan yang bukan pertanyaan registrasi tidak ditangani tool', async () => {
  const cek = new CekBpomTiruan();
  assert.equal(await cekRegistrasiBpom(cek, 'Bagaimana cara membaca label gizi?'), null);
  assert.equal(await cekRegistrasiBpom(cek, 'Apa itu BPOM?', SETELAH_MENU_1), null);
  assert.equal(cek.kueri.length, 0);
});
