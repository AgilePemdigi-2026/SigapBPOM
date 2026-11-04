import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GalatGateway,
  KANDIDAT_MAKS,
  PESAN_TIDAK_DITEMUKAN,
  PESAN_PENGADUAN_TIDAK_LENGKAP,
  htmlKartuEskalasi,
  htmlKartuPengaduan,
  htmlKartuProduk,
  htmlKartuTiket,
  pesanAkhirPanggilan,
  pesanGalatPanggilan,
  pesanTiketEskalasi,
  pesanTiketPengaduan,
  type Produk,
} from './kartuPanggilan.ts';
import { PRODUK_TIRUAN, TRANSKRIP_TIRUAN } from './mock/transkripTiruan.ts';

const SUSU = PRODUK_TIRUAN[0];

test('t_f1_2_01 kartu produk tunggal memuat nama, nomor izin edar, status berteks, pendaftar, dan sumber', () => {
  const html = htmlKartuProduk({ jenis: 'tunggal', produk: SUSU });
  for (const isi of ['Susu Formula Sehat', 'BPOM RI MD 865009001234', 'Berlaku', SUSU.pendaftar, `Sumber: ${SUSU.sumber}`]) {
    assert.ok(html.includes(isi), isi);
  }
  assert.match(html, /icon-circle-check/);
});

test('req_1_5 kartu kandidat menampilkan jumlah hasil dan paling banyak tiga kandidat', () => {
  const lima: Produk[] = Array.from({ length: 5 }, (_, i) => ({ ...SUSU, nama: `Produk ${i + 1}` }));
  const html = htmlKartuProduk({ jenis: 'kandidat', produk: lima });
  assert.match(html, /5 hasil ditemukan, 3 teratas/);
  assert.equal(html.match(/<li>/g)?.length, KANDIDAT_MAKS);
  assert.ok(!html.includes('Produk 4'));
  // Gateway hanya mengirim tiga kandidat, jumlahnya dari total hasil cekbpom.
  assert.match(htmlKartuProduk({ jenis: 'kandidat', total: 5, produk: lima.slice(0, KANDIDAT_MAKS) }), /5 hasil ditemukan, 3 teratas/);
});

test('t_f1_2_01 kartu produk tidak ditemukan memakai pesan baku kamus PRD', () => {
  assert.ok(htmlKartuProduk({ jenis: 'tidak_ditemukan' }).includes(PESAN_TIDAK_DITEMUKAN));
});

test('req_2_1 UC-01 Alternative Path 3: kartu tidak ditemukan memuat tombol 2 Pengaduan Produk', () => {
  const html = htmlKartuProduk({ jenis: 'tidak_ditemukan' });
  assert.match(html, /<button type="button" data-pick="2" aria-label="2: Pengaduan Produk">/);
  assert.match(html, /<span class="t">Pengaduan Produk<\/span>/);
});

test('isi kartu di-escape', () => {
  const html = htmlKartuProduk({ jenis: 'tunggal', produk: { ...SUSU, nama: '<img onerror=x>' } });
  assert.ok(!html.includes('<img'));
});

test('t_f1_4_01 kartu eskalasi menyatakan jawaban dari petugas, bukan AI, dan memuat nomor tiket', () => {
  const html = htmlKartuEskalasi('ESK-20261019-0001');
  assert.match(html, /petugas, bukan oleh AI/);
  assert.ok(html.includes('ESK-20261019-0001'));
  assert.ok(!htmlKartuEskalasi('<b>').includes('<b>'));
});

test('t_f1_4_01 transkrip tiruan eskalasi memakai pesan baku kamus PRD', () => {
  const [minta, terbit] = TRANSKRIP_TIRUAN.eskalasi;
  assert.equal(minta.jawaban, 'Pertanyaan Anda akan diteruskan kepada petugas. Mohon sebutkan nomor telepon Anda.');
  assert.equal(terbit.jawaban, pesanTiketEskalasi(terbit.tiket!));
});

test('req_2_3 kartu tiket pengaduan memuat nomor tiket ADU dan info SMS, nomor di-escape', () => {
  const html = htmlKartuPengaduan('ADU-20261102-0001');
  for (const isi of ['Nomor tiket', 'ADU-20261102-0001', 'Tindak lanjut akan dikirim melalui SMS.']) {
    assert.ok(html.includes(isi), isi);
  }
  assert.ok(!htmlKartuPengaduan('<b>x</b>').includes('<b>'));
});

test('req_2_3 pesan tiket pengaduan dan pengaduan tidak lengkap sama persis dengan kamus PRD', () => {
  assert.equal(
    pesanTiketPengaduan('ADU-20261102-0001'),
    'Pengaduan Anda telah dicatat dengan nomor tiket ADU-20261102-0001. Tindak lanjut akan dikirim melalui SMS.',
  );
  assert.equal(
    PESAN_PENGADUAN_TIDAK_LENGKAP,
    'Panggilan berakhir. Pengaduan belum lengkap sehingga nomor tiket tidak diterbitkan.',
  );
});

test('t_f4_2_03 req_2_4 event tiket pengaduan merender kartu dengan nomor ADU dan teks SMS persis kamus pesan', () => {
  const terbit = TRANSKRIP_TIRUAN.pengaduan.at(-1)!;
  assert.equal(terbit.jawaban, pesanTiketPengaduan('ADU-20261102-0001'));
  const html = htmlKartuTiket({ tiket: terbit.tiket, pengaduan: terbit.pengaduan });
  assert.equal(html, htmlKartuPengaduan('ADU-20261102-0001'));
  assert.ok(html.includes('ADU-20261102-0001'));
  // Teks SMS di kartu adalah kalimat penutup pesan kamus "Tiket pengaduan terbit" tanpa diubah.
  assert.ok(pesanTiketPengaduan('ADU-20261102-0001').endsWith(' Tindak lanjut akan dikirim melalui SMS.'));
  assert.ok(html.includes('<p class="k-sumber">Tindak lanjut akan dikirim melalui SMS.</p>'));
});

test('t_f4_2_03 event pengaduan dari gateway tanpa field tiket tetap merender kartu pengaduan', () => {
  assert.equal(htmlKartuTiket({ pengaduan: 'ADU-20261102-0002' }), htmlKartuPengaduan('ADU-20261102-0002'));
});

test('t_f4_2_03 event tiket eskalasi tetap merender kartu eskalasi, event tanpa tiket tidak merender kartu', () => {
  assert.equal(htmlKartuTiket({ tiket: 'ESK-20261019-0001' }), htmlKartuEskalasi('ESK-20261019-0001'));
  assert.equal(htmlKartuTiket({}), '');
});

test('t_f4_3_03 req_2_5 event pengaduan tidak lengkap dari gateway menampilkan pesan persis kamus pesan', () => {
  // Bentuk `data` balasan /voice/akhiri untuk pengaduan yang belum bertiket.
  const data = { pesan: 'Panggilan berakhir. Pengaduan belum lengkap sehingga nomor tiket tidak diterbitkan.', tersimpan: true, lengkap: 2 };
  assert.equal(
    pesanAkhirPanggilan({ layanan: 2, tiketPengaduan: false, akhir: data }),
    'Panggilan berakhir. Pengaduan belum lengkap sehingga nomor tiket tidak diterbitkan.',
  );
});

test('t_f4_3_03 req_2_5 pengaduan tanpa tiket menampilkan pesan kamus sebelum gateway membalas', () => {
  assert.equal(pesanAkhirPanggilan({ layanan: 2, tiketPengaduan: false }), PESAN_PENGADUAN_TIDAK_LENGKAP);
  assert.equal(pesanAkhirPanggilan({ layanan: 2, tiketPengaduan: false, akhir: null }), PESAN_PENGADUAN_TIDAK_LENGKAP);
});

test('t_f4_3_03 pengaduan bertiket dan layanan informasi produk tidak menampilkan pesan pengaduan tidak lengkap', () => {
  assert.notEqual(pesanAkhirPanggilan({ layanan: 2, tiketPengaduan: true }), PESAN_PENGADUAN_TIDAK_LENGKAP);
  assert.notEqual(pesanAkhirPanggilan({ layanan: 1, tiketPengaduan: false }), PESAN_PENGADUAN_TIDAK_LENGKAP);
  assert.notEqual(pesanAkhirPanggilan({ layanan: null, tiketPengaduan: false }), PESAN_PENGADUAN_TIDAK_LENGKAP);
});

test('or_1 galat jaringan panel suara tampil sebagai pesan kamus, bukan pesan browser', () => {
  assert.equal(pesanGalatPanggilan(new TypeError('Failed to fetch')), 'Layanan suara sedang gangguan. Silakan coba lagi.');
  assert.equal(pesanGalatPanggilan(new SyntaxError('Unexpected token')), 'Layanan suara sedang gangguan. Silakan coba lagi.');
  assert.equal(pesanGalatPanggilan(new GalatGateway()), 'Layanan suara sedang gangguan. Silakan coba lagi.');
  assert.equal(pesanGalatPanggilan(new GalatGateway('Suara tidak terdengar. Silakan ulangi.')), 'Suara tidak terdengar. Silakan ulangi.');
});
