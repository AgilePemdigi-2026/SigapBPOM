import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BatasTiketTercapai, EkstraktorAturan, FIELD_PENGADUAN, JENIS_INTERAKSI, PESAN_MINTA_NOMOR_TELEPON, PROMPT_DATA_KURANG, PengaduanController,
  PESAN_PENGADUAN_TIDAK_LENGKAP, pesanTiketPengaduan, prosesGiliranPengaduan, validasiNomorTelepon,
} from './pengaduan.mjs';
import { GerbangPengaduanTiruan, PengirimSmsTiruan } from './layananPengaduan.mjs';
import { PembatasTiket } from './eskalasi.mjs';
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

// T-F4.2-02: penerbitan tiket pengaduan (REQ-2.3, REQ-2.4, BR-1)

const UCAPAN_LENGKAP = 'Nama produknya Sirup Batuk Sehat. Setelah diminum anak saya demam dan muncul ruam. Nama saya Ahmad Fauzi, nomor telepon saya 0812 3456 7890.';

function rakitan(opsi = {}) {
  const gerbang = new GerbangPengaduanTiruan(() => new Date('2026-11-02T03:00:00Z'));
  const sms = new PengirimSmsTiruan();
  const pengaduan = new PengaduanController({ gerbang, pengirimSms: sms, ...opsi });
  const riwayat = new RiwayatPanggilan();
  pilihMenu(riwayat, pengaduan, ID, 2);
  return { gerbang, sms, pengaduan, riwayat };
}

test('req_2_3 pesan tiket pengaduan sama persis dengan kamus PRD Lampiran A', () => {
  assert.equal(
    pesanTiketPengaduan('ADU-20261102-0001'),
    'Pengaduan Anda telah dicatat dengan nomor tiket ADU-20261102-0001. Tindak lanjut akan dikirim melalui SMS.',
  );
});

test('req_2_3 pengaduan lengkap menghasilkan satu tiket ADU dan pesan tiket diucapkan', async () => {
  const { gerbang, pengaduan, riwayat } = rakitan();
  const h = await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: UCAPAN_LENGKAP, ip: '1.1.1.1' });
  assert.equal(h.tiket, 'ADU-20261102-0001');
  assert.equal(h.jawaban, 'Pengaduan Anda telah dicatat dengan nomor tiket ADU-20261102-0001. Tindak lanjut akan dikirim melalui SMS.');
  assert.equal(gerbang.tiketPerPercakapan.size, 1);
  assert.ok(!pengaduan.aktif(ID));
});

test('req_2_4 SMS tindak lanjut hanya lewat adapter tiruan, sekali per tiket', async () => {
  const { sms, pengaduan, riwayat } = rakitan();
  await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: UCAPAN_LENGKAP, ip: '1.1.1.1' });
  assert.equal(sms.terkirim.length, 1);
  assert.equal(sms.terkirim[0].nomorTelepon, '081234567890');
  assert.match(sms.terkirim[0].teks, /^Pengaduan Anda telah dicatat dengan nomor tiket ADU-\d{8}-\d{4}\./);
});

test('req_2_4 SMS gagal tidak membatalkan tiket', async () => {
  const { pengaduan, riwayat } = rakitan({ pengirimSms: { kirim: async () => { throw new Error('sms down'); } } });
  const h = await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: UCAPAN_LENGKAP, ip: '1.1.1.1' });
  assert.equal(h.tiket, 'ADU-20261102-0001');
});

test('br_1 tiket tidak terbit sebelum keempat data lengkap', async () => {
  const { gerbang, pengaduan, riwayat } = rakitan();
  const h = await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: 'Nama produknya Sirup Batuk Sehat.', ip: '1.1.1.1' });
  assert.equal(h.tiket, null);
  assert.equal(h.tahap, 'tanya_ulang');
  assert.equal(gerbang.tiketPerPercakapan.size, 0);
});

test('req_2_3 retry setelah gagal terbit tidak membuat tiket ganda', async () => {
  const { gerbang, pengaduan, riwayat } = rakitan();
  const asli = gerbang.terbitkanTiket.bind(gerbang);
  let gagal = true;
  gerbang.terbitkanTiket = async (d) => {
    const nomor = await asli(d);
    if (gagal) { gagal = false; throw new Error('jaringan putus setelah tiket tersimpan'); }
    return nomor;
  };
  await assert.rejects(prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: UCAPAN_LENGKAP, ip: '1.1.1.1' }));
  assert.ok(pengaduan.aktif(ID));
  const h = await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: 'baik, terima kasih', ip: '1.1.1.1' });
  assert.equal(h.tiket, 'ADU-20261102-0001');
  assert.equal(gerbang.tiketPerPercakapan.size, 1);
});

test('req_2_3 giliran serentak berbagi satu penerbitan', async () => {
  const { gerbang, pengaduan } = rakitan();
  let panggilan = 0;
  const asli = gerbang.terbitkanTiket.bind(gerbang);
  gerbang.terbitkanTiket = async (d) => { panggilan++; return asli(d); };
  const [a, b] = await Promise.all([pengaduan.tangani(ID, UCAPAN_LENGKAP), pengaduan.tangani(ID, UCAPAN_LENGKAP)]);
  assert.equal(panggilan, 1);
  assert.equal(a.tiket, b.tiket);
});

test('req_2_3 giliran pengaduan lengkap tidak memanggil AI dan ucapan mentah tidak masuk riwayat', async () => {
  const { pengaduan, riwayat } = rakitan();
  await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: UCAPAN_LENGKAP, ip: '1.1.1.1' });
  // prosesGiliranPengaduan tidak punya akses ke klien AI; yang bisa dibuktikan: apa pun yang akan dikirim ke model bersih dari data pelapor.
  const kePrompt = JSON.stringify(riwayat.untukModel(ID));
  for (const rahasia of ['Ahmad Fauzi', '0812', '081234567890', 'Sirup Batuk Sehat', 'demam dan muncul ruam']) assert.ok(!kePrompt.includes(rahasia), rahasia);
});

test('req_2_3 batas penerbitan tiket per panggilan memicu BatasTiketTercapai tanpa tiket', async () => {
  const pembatas = new PembatasTiket({ perPanggilan: 1, perIpHarian: 5, perNomorHarian: 3 });
  const { gerbang, pengaduan } = rakitan({ pembatas });
  pembatas.cadangkan(ID, '1.1.1.1', '081200000000');
  await assert.rejects(pengaduan.tangani(ID, UCAPAN_LENGKAP, { ip: '1.1.1.1' }), BatasTiketTercapai);
  assert.equal(gerbang.tiketPerPercakapan.size, 0);
});

// T-F4.3-01: panggilan berakhir sebelum data lengkap (REQ-2.5)

test('req_2_5 pesan pengaduan tidak lengkap sama persis dengan kamus PRD Lampiran A', () => {
  assert.equal(PESAN_PENGADUAN_TIDAK_LENGKAP, 'Panggilan berakhir. Pengaduan belum lengkap sehingga nomor tiket tidak diterbitkan.');
});

test('req_2_5 akhiri panggilan dengan data sebagian menyimpan pengaduan_tidak_lengkap tanpa tiket', async () => {
  const { gerbang, sms, pengaduan, riwayat } = rakitan();
  await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: 'Nama produknya Krim Glowing Ajaib. Atas nama Siti Aminah.', ip: '1.1.1.1' });
  const hasil = await pengaduan.panggilanBerakhir(ID);
  assert.equal(hasil.pesan, PESAN_PENGADUAN_TIDAK_LENGKAP);
  assert.equal(hasil.tersimpan, true);
  const simpan = gerbang.tidakLengkap.get(ID);
  assert.equal(simpan.status, 'pengaduan_tidak_lengkap');
  assert.equal(simpan.namaProduk, 'Krim Glowing Ajaib');
  assert.equal(simpan.namaPelapor, 'Siti Aminah');
  assert.equal(gerbang.tiketPerPercakapan.size, 0);
  assert.equal(sms.terkirim.length, 0);
  assert.ok(!pengaduan.aktif(ID));
});

test('req_2_5 akhiri panggilan tanpa data apa pun tetap disimpan sebagai tidak lengkap', async () => {
  const { gerbang, pengaduan } = rakitan();
  const hasil = await pengaduan.panggilanBerakhir(ID);
  assert.equal(hasil.tersimpan, true);
  assert.equal(gerbang.tidakLengkap.get(ID).status, 'pengaduan_tidak_lengkap');
});

test('req_2_5 akhiri berulang (tombol lalu koneksi putus) hanya menyimpan sekali', async () => {
  const { gerbang, pengaduan } = rakitan();
  let simpan = 0;
  const asli = gerbang.simpanTidakLengkap.bind(gerbang);
  gerbang.simpanTidakLengkap = async (d) => { simpan++; return asli(d); };
  const [a, b] = await Promise.all([pengaduan.panggilanBerakhir(ID), pengaduan.panggilanBerakhir(ID)]);
  assert.equal(simpan, 1);
  assert.ok(a && b === null);
});

test('req_2_5 pengaduan yang sudah bertiket atau bukan pengaduan tidak disimpan sebagai tidak lengkap', async () => {
  const { gerbang, pengaduan, riwayat } = rakitan();
  await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: UCAPAN_LENGKAP, ip: '1.1.1.1' });
  assert.equal(await pengaduan.panggilanBerakhir(ID), null);
  assert.equal(gerbang.tidakLengkap.size, 0);
  assert.equal(await pengaduan.panggilanBerakhir('7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'), null);
});

test('req_2_5 galat penyimpanan tidak mengganggu penutupan panggilan', async () => {
  const { gerbang, pengaduan } = rakitan();
  gerbang.simpanTidakLengkap = async () => { throw new Error('down'); };
  const hasil = await pengaduan.panggilanBerakhir(ID);
  assert.equal(hasil.tersimpan, false);
  assert.equal(hasil.pesan, PESAN_PENGADUAN_TIDAK_LENGKAP);
});

test('req_2_5 penerbitan yang sedang berjalan saat panggilan berakhir tidak berakhir sebagai tidak lengkap', async () => {
  const { gerbang, pengaduan } = rakitan();
  const asli = gerbang.terbitkanTiket.bind(gerbang);
  gerbang.terbitkanTiket = async (d) => { await new Promise((r) => setTimeout(r, 20)); return asli(d); };
  const lengkap = pengaduan.tangani(ID, UCAPAN_LENGKAP);
  await new Promise((r) => setImmediate(r));
  const akhir = pengaduan.panggilanBerakhir(ID);
  assert.equal((await lengkap).tiket, 'ADU-20261102-0001');
  assert.equal(await akhir, null);
  assert.equal(gerbang.tidakLengkap.size, 0);
});

test('req_2_5 koneksi putus: sesi tidak aktif yang dibuang memicu penyimpanan pengaduan tidak lengkap', async () => {
  let t = 0;
  const riwayat = new RiwayatPanggilan(() => t);
  const gerbang = new GerbangPengaduanTiruan();
  const pengaduan = new PengaduanController({ gerbang });
  riwayat.saatDibuang = (id) => { pengaduan.panggilanBerakhir(id); };
  pilihMenu(riwayat, pengaduan, ID, 2);
  t = 16 * 60 * 1000;
  riwayat.bersihkan();
  await new Promise((r) => setImmediate(r));
  assert.equal(gerbang.tidakLengkap.get(ID)?.status, 'pengaduan_tidak_lengkap');
});

test('req_2_3 gerbang tiruan: satu percakapan satu tiket, format ADU-YYYYMMDD-NNNN', async () => {
  const g = new GerbangPengaduanTiruan(() => new Date('2026-11-02T03:00:00Z'));
  const d = { percakapanId: ID, namaProduk: 'A', kronologi: 'b c d', namaPelapor: 'E', nomorTelepon: '081234567890' };
  assert.equal(await g.terbitkanTiket(d), 'ADU-20261102-0001');
  assert.equal(await g.terbitkanTiket(d), 'ADU-20261102-0001');
  assert.equal(await g.terbitkanTiket({ ...d, percakapanId: '7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b' }), 'ADU-20261102-0002');
  await assert.rejects(g.terbitkanTiket({ ...d, nomorTelepon: '' }));
});
