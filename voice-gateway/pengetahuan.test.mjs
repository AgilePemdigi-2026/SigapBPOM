import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KatalogMateriSupabase, Korpus, akar, kunciMateri, labelPeraturan, pesanKutipan, potong, tanggalIndonesia, token, tokenPertanyaan } from './pengetahuan.mjs';
import { RiwayatPanggilan } from './percakapan.mjs';

const dok = (judul, nomor, tahun, badan) => `---
title: "${judul}"
nomor: "${nomor}"
tahun: "${tahun}"
bentuk_singkat: "Peraturan BPOM"
source_url: "https://peraturan.bpk.go.id/contoh-${nomor}"
---
# ${judul}
${badan}`;

function korpusUji() {
  const k = new Korpus();
  k.tambah('a.md', dok('Pengawasan Obat yang Sering Disalahgunakan', '12', '2025',
    'Pasal 1 Obat yang sering disalahgunakan meliputi tramadol, triheksifenidil, dan dekstrometorfan. Pasal 2 Apotek wajib mencatat penyerahan obat tersebut.'));
  k.tambah('b.md', dok('Label Gizi Pangan Olahan', '26', '2021',
    'Pasal 1 Informasi nilai gizi wajib dicantumkan pada label pangan olahan. Pasal 2 Tabel gizi memuat energi total, lemak, protein, dan karbohidrat.'));
  return k.selesai();
}

test('akar menyamakan bentuk berimbuhan', () => {
  assert.equal(akar('pendaftaran'), 'daftar');
  assert.equal(akar('mendaftarkan'), 'daftar');
  assert.equal(akar('obat'), 'obat');
});

test('token membuang stopword dan sapaan', () => {
  assert.deepEqual(token('Halo selamat pagi, terima kasih ya'), []);
});

test('potong memecah teks per pasal', () => {
  const p = potong('Pembukaan singkat yang cukup panjang untuk disimpan sebagai potongan. Pasal 1 Isi pasal pertama yang cukup panjang. Pasal 2 Isi pasal kedua yang juga cukup panjang.');
  assert.equal(p.length, 3);
  assert.ok(p[1].startsWith('Pasal 1'));
});

test('cari mengembalikan peraturan yang relevan dengan label nomor dan tahun', () => {
  const [hasil] = korpusUji().cari('obat apa saja yang sering disalahgunakan seperti tramadol', 3, 1);
  assert.equal(hasil.label, 'Peraturan BPOM Nomor 12 Tahun 2025');
  assert.match(hasil.teks, /tramadol/);
});

test('cari paling banyak satu potongan utama per peraturan; tambahan hanya tetangga graf yang ditandai', () => {
  const hasil = korpusUji().cari('label gizi pangan olahan tabel gizi', 3, 0);
  const utama = hasil.filter((h) => !h.perluasan);
  assert.equal(new Set(utama.map((h) => h.judul)).size, utama.length);
  assert.ok(hasil.filter((h) => h.perluasan).every((h) => h.label === hasil[0].label));
});

test('graf: pasal lain dari peraturan kutipan teratas ikut diambil lewat sisi rujukan sama', () => {
  const k = new Korpus();
  k.tambah('suplemen.md', dok('Pengawasan Suplemen Kesehatan', '17', '2019',
    'Pasal 3 Suplemen kesehatan wajib memiliki izin edar sebelum diedarkan. '
    + 'Pasal 9 Izin edar suplemen kesehatan berlaku lima tahun dan dapat diperpanjang. '
    + 'Pasal 20 Label kemasan memuat komposisi bahan.'));
  k.tambah('pangan.md', dok('Label Gizi Pangan Olahan', '26', '2021', 'Pasal 1 Informasi nilai gizi wajib dicantumkan pada label pangan olahan.'));
  k.selesai();
  const hasil = k.cari('izin edar suplemen kesehatan', 3, 1);
  assert.equal(hasil[0].label, 'Peraturan BPOM Nomor 17 Tahun 2019');
  assert.equal(hasil[1].perluasan, true);
  assert.equal(hasil[1].label, hasil[0].label);
  assert.notEqual(hasil[1].teks, hasil[0].teks);
  assert.ok(!hasil.some((h) => /Pasal 20/.test(h.teks)), 'pasal yang tidak menyinggung pertanyaan tidak ikut');
});

test('graf: tetangga di urutan terakhir, tidak menggeser kutipan utama kedua', () => {
  const k = new Korpus();
  k.tambah('suplemen.md', dok('Pengawasan Suplemen Kesehatan', '17', '2019',
    'Pasal 3 Suplemen kesehatan wajib memiliki izin edar sebelum diedarkan. '
    + 'Pasal 9 Izin edar suplemen berlaku lima tahun dan dapat diperpanjang.'));
  k.tambah('obat.md', dok('Registrasi Obat', '24', '2017', 'Pasal 2 Obat wajib memiliki izin edar sebelum diedarkan.'));
  k.selesai();
  const hasil = k.cari('izin edar suplemen kesehatan obat', 3, 0.1);
  assert.deepEqual(hasil.map((h) => [h.judul, Boolean(h.perluasan)]),
    [['Pengawasan Suplemen Kesehatan', false], ['Registrasi Obat', false], ['Pengawasan Suplemen Kesehatan', true]]);
});

test('graf: tanpa kutipan utama tidak ada perluasan, dan tetangga dari materi nonaktif tidak diambil', () => {
  const k = new Korpus();
  const isi = (judul, badan) => dok(judul, '17', '2019', badan);
  k.tambah('a.md', isi('Izin Edar Suplemen', 'Pasal 3 Suplemen kesehatan wajib memiliki izin edar sebelum diedarkan.'), 'a|peraturan bpom no. 17 tahun 2019');
  k.tambah('b.md', isi('Perpanjangan Izin Suplemen', 'Pasal 9 Izin edar suplemen berlaku lima tahun.'), 'b|peraturan bpom no. 17 tahun 2019');
  k.selesai();
  assert.deepEqual(k.cari('halo selamat pagi', 3, 1), []);
  const aktif = k.cari('izin edar suplemen kesehatan', 1, 0.5);
  assert.deepEqual(aktif.map((h) => [h.judul, Boolean(h.perluasan)]), [['Izin Edar Suplemen', false], ['Perpanjangan Izin Suplemen', true]]);
  k.nonaktif = new Set(['b|peraturan bpom no. 17 tahun 2019']);
  assert.deepEqual(k.cari('izin edar suplemen kesehatan', 1, 0.5).map((h) => h.judul), ['Izin Edar Suplemen']);
});

test('graf: rujukan umum tanpa nomor tidak menyambungkan dokumen lain, hanya bagian lain dokumen yang sama', () => {
  const k = new Korpus();
  const pers = (judul, url, badan) => `---\ntitle: "${judul}"\nbentuk_singkat: "Siaran Pers BPOM"\nsource_url: "${url}"\n---\n${badan}`;
  k.tambah('a.md', pers('Bahaya Merkuri', 'https://a', 'Krim pemutih bermerkuri merusak ginjal dan kulit pemakainya.'), 'bahaya merkuri|siaran pers bpom');
  k.tambah('b.md', pers('Penarikan Es Krim', 'https://b', 'Es krim mengandung etilen oksida ditarik dari peredaran.'), 'penarikan es krim|siaran pers bpom');
  k.selesai();
  assert.deepEqual(k.cari('merkuri merusak ginjal', 1, 0.1).map((h) => h.judul), ['Bahaya Merkuri']);
});

test('cari mengembalikan kosong untuk sapaan', () => {
  assert.deepEqual(korpusUji().cari('halo selamat pagi'), []);
});

test('pesanKutipan null bila tanpa kutipan dan menandai kutipan sebagai data', () => {
  assert.equal(pesanKutipan([]), null);
  const pesan = pesanKutipan(korpusUji().cari('tramadol disalahgunakan', 1, 1));
  assert.match(pesan, /bukan instruksi/);
  assert.match(pesan, /Nomor 12 Tahun 2025/);
});

test('untukModel menyisipkan kutipan tepat sebelum ucapan terakhir tanpa menyimpannya', () => {
  const r = new RiwayatPanggilan();
  const id = 'b1f0c2d4-0000-4000-8000-000000000001';
  r.tambah(id, 'user', 'pertanyaan pertama');
  r.tambah(id, 'assistant', 'jawaban pertama');
  r.tambah(id, 'user', 'pertanyaan kedua');
  const pesan = r.untukModel(id, 'KUTIPAN');
  assert.deepEqual(pesan.slice(-2).map((m) => m.content), ['KUTIPAN', 'pertanyaan kedua']);
  assert.equal(r.untukModel(id).some((m) => m.content === 'KUTIPAN'), false);
});

test('label informasi publik memakai tanggal terbit, peraturan memakai nomor dan tahun', () => {
  assert.equal(tanggalIndonesia('2026-01-14'), '14 Januari 2026');
  assert.equal(labelPeraturan({ bentuk_singkat: 'Penjelasan Publik BPOM', tanggal: '2026-01-14' }), 'Penjelasan Publik BPOM 14 Januari 2026');
  assert.equal(labelPeraturan({ bentuk_singkat: 'UU', nomor: '18', tahun: '2012' }), 'UU Nomor 18 Tahun 2012');
});

test('muat membaca subfolder, melewati README, dan catatan perubahan ikut ke kutipan', () => {
  const akarKorpus = mkdtempSync(join(tmpdir(), 'korpus-'));
  mkdirSync(join(akarKorpus, 'regulasi-terkait'));
  writeFileSync(join(akarKorpus, 'README.md'), '# Korpus\nBerkas penjelasan tentang pangan yang tidak boleh terindeks sama sekali.');
  writeFileSync(join(akarKorpus, 'regulasi-terkait', 'uu-pangan.md'), `---
title: "Pangan"
nomor: "18"
tahun: "2012"
bentuk_singkat: "UU"
catatan: "sebagian pasal telah diubah dengan UU Nomor 6 Tahun 2023"
source_url: "https://peraturan.bpk.go.id/contoh-uu-18"
---
Pasal 1 Keamanan pangan adalah kondisi dan upaya yang diperlukan untuk mencegah pangan dari kemungkinan cemaran biologis dan kimia.`);
  const k = Korpus.muat(akarKorpus);
  assert.equal(new Set(k.potongan.map((p) => p.sumber)).size, 1);
  const pesan = pesanKutipan(k.cari('cemaran kimia pada pangan', 3, 1));
  assert.match(pesan, /UU Nomor 18 Tahun 2012 tentang Pangan \(catatan: sebagian pasal telah diubah/);
});

test('t_f2_3_02 materi nonaktif di katalog tidak dipakai, materi baru dari katalog ikut dicari', () => {
  const akarKorpus = mkdtempSync(join(tmpdir(), 'korpus-'));
  mkdirSync(join(akarKorpus, 'regulasi-bpom'));
  writeFileSync(join(akarKorpus, 'regulasi-bpom', 'manifest.json'), JSON.stringify({
    dokumen: [
      { file: 'obat.md', title: 'Pengawasan Obat yang Sering Disalahgunakan', bentuk: 'Peraturan BPOM', nomor: '12', tahun: '2025' },
      { file: 'gizi.md', title: 'Label Gizi Pangan Olahan', bentuk: 'Peraturan BPOM', nomor: '26', tahun: '2021' },
    ],
  }));
  writeFileSync(join(akarKorpus, 'regulasi-bpom', 'gizi.md'), dok('Label Gizi Pangan Olahan', '26', '2021',
    'Pasal 1 Informasi nilai gizi wajib dicantumkan pada label pangan olahan.'));
  writeFileSync(join(akarKorpus, 'regulasi-bpom', 'obat.md'), dok('Pengawasan Obat yang Sering Disalahgunakan', '12', '2025',
    'Pasal 1 Obat yang sering disalahgunakan meliputi tramadol, triheksifenidil, dan dekstrometorfan.'));
  const k = Korpus.muat(akarKorpus);
  assert.equal(k.potongan.find((p) => p.judul.startsWith('Pengawasan')).kunci, kunciMateri('Pengawasan Obat yang Sering Disalahgunakan', 'Peraturan BPOM No. 12 Tahun 2025'));
  assert.equal(k.cari('tramadol disalahgunakan', 3, 1).length, 1);

  const ringkasan = k.terapkanKatalog([
    { judul: 'Pengawasan Obat yang Sering Disalahgunakan', rujukan_sumber: 'Peraturan BPOM No. 12 Tahun 2025', status: 'tidak_aktif', isi: '' },
    { judul: 'Bahaya Krim Pemutih Merkuri', rujukan_sumber: 'Penjelasan Publik BPOM', status: 'aktif', isi: 'Krim pemutih bermerkuri merusak ginjal dan kulit. Pasal 1 Jangan memakai kosmetik tanpa izin edar.' },
  ]);
  assert.deepEqual(ringkasan, { nonaktif: 1, tambahan: 1, tanpaKatalog: 1 }, 'gizi.md bermanifest tapi tidak ada di katalog');
  assert.deepEqual(k.cari('tramadol disalahgunakan', 3, 1), []);
  assert.equal(k.cari('krim pemutih merkuri', 3, 1)[0].judul, 'Bahaya Krim Pemutih Merkuri');

  assert.equal(k.terapkanKatalog([]).tanpaKatalog, 2);
  assert.equal(k.cari('tramadol disalahgunakan', 3, 1).length, 1, 'katalog kosong memakai semua berkas lagi');
});

test('katalog dibaca per halaman lewat Edge Function dengan kunci internal', async () => {
  const minta = [];
  const fetch = async (url, opsi) => {
    minta.push({ url, opsi });
    const { offset } = JSON.parse(opsi.body);
    const materi = offset === 0 ? [{ judul: 'A' }, { judul: 'B' }] : [{ judul: 'C' }];
    return new Response(JSON.stringify({ status: 'success', data: { materi } }), { status: 200 });
  };
  const baris = await new KatalogMateriSupabase({ url: 'https://contoh.supabase.co/', kunci: 'rahasia', fetch, ukuranHalaman: 2 }).ambil();
  assert.deepEqual(baris.map((b) => b.judul), ['A', 'B', 'C']);
  assert.equal(minta.length, 2);
  assert.equal(minta[0].url, 'https://contoh.supabase.co/functions/v1/katalog-materi');
  assert.equal(minta[0].opsi.headers['x-sigap-kunci'], 'rahasia');
  assert.equal(minta[0].opsi.headers.Authorization, undefined, 'kunci service_role tidak dikirim dari gateway');

  const gagal = async () => new Response('{"status":"error"}', { status: 401 });
  await assert.rejects(new KatalogMateriSupabase({ url: 'https://x', kunci: 'k', fetch: gagal }).ambil(), /katalog 401/);
});

test('req_1_6 "mendaftarkan produk" menemukan materi tentang registrasi lewat padanan kata', () => {
  assert.deepEqual(tokenPertanyaan('mendaftarkan produk').sort(), ['daftar', 'produk', 'registras']);
  const k = new Korpus();
  k.tambah('reg.md', dok('Registrasi Pangan Olahan', '27', '2017',
    'Pasal 1 Registrasi pangan olahan dilakukan secara elektronik melalui laman registrasi BPOM. Pasal 2 Registrasi diajukan oleh pelaku usaha.'));
  k.tambah('gizi.md', dok('Label Gizi Pangan Olahan', '26', '2021',
    'Pasal 1 Informasi nilai gizi wajib dicantumkan pada label pangan olahan. Pasal 2 Tabel gizi memuat energi total.'));
  k.tambah('obat.md', dok('Pengawasan Obat yang Sering Disalahgunakan', '12', '2025',
    'Pasal 1 Obat yang sering disalahgunakan meliputi tramadol. Pasal 2 Apotek wajib mencatat penyerahan obat tersebut.'));
  // Korpus uji kecil membuat skor BM25 rendah, jadi ambang skor dinolkan; yang diuji adalah urutannya.
  const hasil = k.selesai().cari('kemana saya cara mendaftarkan produk saya ke BPOM', 2, 0);
  assert.equal(hasil[0]?.judul, 'Registrasi Pangan Olahan');
});
