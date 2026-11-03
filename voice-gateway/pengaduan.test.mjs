import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BatasTiketTercapai, EkstraktorAturan, FIELD_PENGADUAN, JENIS_INTERAKSI, PESAN_BATAS_PERCAKAPAN, PESAN_MINTA_NOMOR_TELEPON, PROMPT_DATA_KURANG,
  PengaduanController, PESAN_PENGADUAN_TIDAK_LENGKAP, PercakapanDitolak, pesanTiketPengaduan, prosesGiliranPengaduan, validasiNomorTelepon,
} from './pengaduan.mjs';
import { GerbangPengaduanSupabase, GerbangPengaduanTiruan, PengirimSmsTiruan } from './layananPengaduan.mjs';
import { PembatasTiket } from './eskalasi.mjs';
import { PESAN_BATAS_AI, PESAN_LAYANAN_1, PESAN_LAYANAN_2, RiwayatPanggilan, SesiPenuh, pilihMenu } from './percakapan.mjs';

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

test('req_2_2 kata keterangan waktu dan nama anggota keluarga tidak tertangkap sebagai data', () => {
  assert.equal(ekstrak('Susu kental manis merek A, saya beli kemarin dan anak saya sakit perut', 'namaProduk').namaProduk, undefined);
  assert.equal(ekstrak('anak saya bernama Budi muntah setelah minum sirup obat batuk').namaPelapor, undefined);
});

// Kalimat persis SRS Tabel B.3 (Basic Path, Alternative Path 1, Exception Path 1).
const SRS_BASIC = 'Krim Wajah Glowing membuat kulit saya iritasi setelah dua hari pemakaian. Nama saya Budi Santoso, nomor telepon 081234567890.';
const SRS_ALTERNATIF = 'Krim Wajah Glowing membuat kulit saya iritasi. Nama saya Budi Santoso.';
const SRS_EXCEPTION = 'Krim Wajah Glowing membuat kulit saya iritasi.';

test('req_2_2 kalimat Basic Path SRS: nama produk di awal kalimat tertangkap dan kronologi tidak terpotong', () => {
  assert.deepEqual(ekstrak(SRS_BASIC), {
    namaProduk: 'Krim Wajah Glowing',
    kronologi: 'Krim Wajah Glowing membuat kulit saya iritasi setelah dua hari pemakaian',
    namaPelapor: 'Budi Santoso',
    nomorTelepon: '081234567890',
  });
});

test('req_2_2 kalimat Alternative Path dan Exception Path SRS hanya mengisi data yang disebutkan', () => {
  assert.deepEqual(ekstrak(SRS_ALTERNATIF), {
    namaProduk: 'Krim Wajah Glowing', kronologi: 'Krim Wajah Glowing membuat kulit saya iritasi', namaPelapor: 'Budi Santoso',
  });
  assert.deepEqual(ekstrak(SRS_EXCEPTION), { namaProduk: 'Krim Wajah Glowing', kronologi: 'Krim Wajah Glowing membuat kulit saya iritasi' });
});

test('req_2_2 kalimat akibat: anak kalimat dibuang, subjek kata ganti atau permintaan bukan nama produk', () => {
  assert.equal(ekstrak('Krim Wajah Glowing yang saya beli membuat kulit saya iritasi.').namaProduk, 'Krim Wajah Glowing');
  assert.equal(ekstrak('Nama saya Budi Santoso, Sabun Wangi bikin kulit anak saya gatal.').namaProduk, 'Sabun Wangi');
  assert.equal(ekstrak('Setelah dua hari, Krim Wajah Glowing membuat kulit saya iritasi.').kronologi, 'Setelah dua hari, Krim Wajah Glowing membuat kulit saya iritasi');
  assert.deepEqual(ekstrak('Saya mau membuat pengaduan produk'), {});
  assert.deepEqual(ekstrak('Krim ini membuat kulit saya gatal'), {});
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

function catatTerbit(gerbang) {
  const tercatat = [];
  const asli = gerbang.terbitkanTiket.bind(gerbang);
  gerbang.terbitkanTiket = async (d) => { tercatat.push(d); return asli(d); };
  return tercatat;
}

test('req_2_3 skenario Basic Path SRS: satu kalimat lengkap langsung menerbitkan tiket', async () => {
  const { gerbang, pengaduan, riwayat } = rakitan();
  const tercatat = catatTerbit(gerbang);
  const h = await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: SRS_BASIC, ip: '1.1.1.1' });
  assert.equal(h.jawaban, 'Pengaduan Anda telah dicatat dengan nomor tiket ADU-20261102-0001. Tindak lanjut akan dikirim melalui SMS.');
  assert.deepEqual(tercatat, [{
    percakapanId: ID, namaProduk: 'Krim Wajah Glowing', kronologi: 'Krim Wajah Glowing membuat kulit saya iritasi setelah dua hari pemakaian',
    namaPelapor: 'Budi Santoso', nomorTelepon: '081234567890',
  }]);
});

test('req_2_2 skenario Alternative Path 1 SRS: hanya nomor telepon yang ditanyakan kembali', async () => {
  const { gerbang, pengaduan, riwayat } = rakitan();
  const tercatat = catatTerbit(gerbang);
  let h = await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: SRS_ALTERNATIF, ip: '1.1.1.1' });
  assert.equal(h.jawaban, 'Mohon sebutkan nomor telepon Anda.');
  assert.equal(h.kurang, 1);
  h = await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: '081234567890', ip: '1.1.1.1' });
  assert.equal(h.jawaban, 'Pengaduan Anda telah dicatat dengan nomor tiket ADU-20261102-0001. Tindak lanjut akan dikirim melalui SMS.');
  assert.equal(tercatat[0].namaProduk, 'Krim Wajah Glowing');
  assert.equal(tercatat[0].kronologi, 'Krim Wajah Glowing membuat kulit saya iritasi');
});

test('req_2_5 skenario Exception Path 1 SRS: data sebagian disimpan tanpa tiket', async () => {
  const { gerbang, pengaduan, riwayat } = rakitan();
  await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: SRS_EXCEPTION, ip: '1.1.1.1' });
  const hasil = await pengaduan.panggilanBerakhir(ID);
  assert.equal(hasil.pesan, 'Panggilan berakhir. Pengaduan belum lengkap sehingga nomor tiket tidak diterbitkan.');
  const simpan = gerbang.tidakLengkap.get(ID);
  assert.equal(simpan.namaProduk, 'Krim Wajah Glowing');
  assert.equal(simpan.kronologi, 'Krim Wajah Glowing membuat kulit saya iritasi');
  assert.equal(gerbang.tiketPerPercakapan.size, 0);
});

// Satu percakapan satu tiket (tiket.percakapan_id unik): pengaduan kedua tidak boleh dijawab seolah tercatat.

test('req_2_3 pesan pengaduan kedua sama persis dengan kamus Lampiran A (batas percakapan satu panggilan)', () => {
  assert.equal(PESAN_BATAS_PERCAKAPAN, 'Batas percakapan untuk panggilan ini sudah tercapai. Silakan akhiri dan mulai panggilan baru.');
  assert.equal(PESAN_BATAS_PERCAKAPAN, PESAN_BATAS_AI.panggilan);
});

test('req_2_3 menekan 2 lagi setelah tiket terbit tidak mencatat atau mengaku mencatat pengaduan kedua', async () => {
  const { gerbang, sms, pengaduan, riwayat } = rakitan();
  const tercatat = catatTerbit(gerbang);
  await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: SRS_BASIC, ip: '1.1.1.1' });
  for (const pilihan of [[2], [1, 2]]) {
    for (const n of pilihan) pilihMenu(riwayat, pengaduan, ID, n);
    // Ucapan tetap ditangani gateway tanpa AI, supaya data pelapor tidak sampai ke model.
    assert.ok(pengaduan.aktif(ID));
    const h = await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: UCAPAN_LENGKAP, ip: '1.1.1.1' });
    assert.equal(h.jawaban, PESAN_BATAS_PERCAKAPAN);
    assert.equal(h.tiket, null);
    assert.equal(h.suara, null);
  }
  assert.equal(tercatat.length, 1);
  assert.equal(sms.terkirim.length, 1);
  assert.ok(!JSON.stringify(riwayat.untukModel(ID)).includes('Ahmad Fauzi'));
  assert.equal(await pengaduan.panggilanBerakhir(ID), null);
  assert.equal(gerbang.tidakLengkap.size, 0);
});

test('req_2_3 memilih layanan 1 setelah tiket terbit kembali ke alur UC-01', async () => {
  const { pengaduan, riwayat } = rakitan();
  await prosesGiliranPengaduan({ pengaduan, riwayat, id: ID, ucapan: SRS_BASIC, ip: '1.1.1.1' });
  pilihMenu(riwayat, pengaduan, ID, 2);
  pilihMenu(riwayat, pengaduan, ID, 1);
  assert.ok(!pengaduan.aktif(ID));
});

test('req_2_3 giliran yang tiketnya terbit selama ekstraksi tidak menerbitkan atau mengaku mencatat lagi', async () => {
  let lepas;
  const tahan = new Promise((r) => { lepas = r; });
  const ekstraktor = new EkstraktorAturan();
  const { gerbang, pengaduan } = rakitan({ ekstraktor: { ekstrak: async (u, k) => (u === 'tahan' ? (await tahan, {}) : ekstraktor.ekstrak(u, k)) } });
  const tercatat = catatTerbit(gerbang);
  const kedua = pengaduan.tangani(ID, 'tahan');
  assert.match((await pengaduan.tangani(ID, SRS_BASIC)).jawaban, /^Pengaduan Anda telah dicatat/);
  lepas();
  assert.equal((await kedua).jawaban, PESAN_BATAS_PERCAKAPAN);
  assert.equal(tercatat.length, 1);
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

test('req_2_5 akhiri panggilan tepat setelah menekan 2 tanpa data apa pun tidak menyimpan pengaduan', async () => {
  const { gerbang, pengaduan } = rakitan();
  let simpan = 0;
  gerbang.simpanTidakLengkap = async () => { simpan++; };
  const hasil = await pengaduan.panggilanBerakhir(ID);
  assert.deepEqual(hasil, { pesan: PESAN_PENGADUAN_TIDAK_LENGKAP, tersimpan: false, lengkap: 0 });
  assert.equal(simpan, 0);
  assert.ok(!pengaduan.aktif(ID));
});

test('req_2_5 akhiri berulang (tombol lalu koneksi putus) hanya menyimpan sekali', async () => {
  const { gerbang, pengaduan } = rakitan();
  await pengaduan.tangani(ID, SRS_EXCEPTION);
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
  await pengaduan.tangani(ID, SRS_EXCEPTION);
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
  await pengaduan.tangani(ID, SRS_EXCEPTION);
  t = 16 * 60 * 1000;
  riwayat.bersihkan();
  await new Promise((r) => setImmediate(r));
  assert.equal(gerbang.tidakLengkap.get(ID)?.status, 'pengaduan_tidak_lengkap');
});

// Kapasitas sesi dan penolakan server

const idKe = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('req_2_5 kapasitas penuh menggeser sesi tertua tanpa pengaduan dan tidak memicu penyimpanan tidak lengkap', async () => {
  const riwayat = new RiwayatPanggilan();
  const gerbang = new GerbangPengaduanTiruan();
  const pengaduan = new PengaduanController({ gerbang });
  const dibuang = [];
  riwayat.saatDibuang = (id) => dibuang.push(id);
  riwayat.dilindungi = (id) => pengaduan.aktif(id);
  pilihMenu(riwayat, pengaduan, idKe(0), 2); // pengaduan berjalan, paling tua
  for (let i = 1; i < 200; i++) riwayat.ambil(idKe(i));
  riwayat.ambil(idKe(500)); // sesi ke-201: yang tergeser idKe(1), bukan pengaduan idKe(0)
  assert.ok(pengaduan.aktif(idKe(0)));
  assert.ok(riwayat.sesi.has(idKe(0)));
  assert.ok(!riwayat.sesi.has(idKe(1)));
  assert.deepEqual(dibuang, []);
  assert.equal(gerbang.tidakLengkap.size, 0);
});

test('req_2_5 kapasitas penuh oleh pengaduan berjalan menolak sesi baru, bukan menggeser', () => {
  const riwayat = new RiwayatPanggilan();
  const pengaduan = new PengaduanController({ gerbang: new GerbangPengaduanTiruan() });
  riwayat.dilindungi = (id) => pengaduan.aktif(id);
  for (let i = 0; i < 200; i++) pilihMenu(riwayat, pengaduan, idKe(i), 2);
  assert.throws(() => riwayat.ambil(idKe(900)), SesiPenuh);
  assert.equal(riwayat.sesi.size, 200);
  for (let i = 0; i < 200; i++) assert.ok(pengaduan.aktif(idKe(i)));
});

test('req_2_5 kapasitas sesi pengaduan penuh menggeser sesi bertiket dulu, bukan pengaduan berjalan', async () => {
  const lengkap = { namaProduk: 'A', kronologi: 'b c d', namaPelapor: 'E', nomorTelepon: '081234567890' };
  const pengaduan = new PengaduanController({ gerbang: new GerbangPengaduanTiruan(), ekstraktor: { ekstrak: () => lengkap } });
  pengaduan.mulai(idKe(0)); // pengaduan berjalan, paling tua
  for (let i = 1; i < 500; i++) {
    pengaduan.mulai(idKe(i));
    await pengaduan.tangani(idKe(i), 'data lengkap');
  }
  pengaduan.mulai(idKe(900));
  assert.ok(pengaduan.aktif(idKe(0)));
  assert.ok(!pengaduan.sesi.has(idKe(1)));
  assert.equal(pengaduan.sesi.size, 500);
});

test('req_2_5 sesi tidak aktif tetap memicu saatDibuang lewat bersihkan', () => {
  let t = 0;
  const riwayat = new RiwayatPanggilan(() => t);
  const dibuang = [];
  riwayat.saatDibuang = (id) => dibuang.push(id);
  riwayat.ambil(ID);
  t = 16 * 60 * 1000;
  riwayat.bersihkan();
  assert.deepEqual(dibuang, [ID]);
});

test('req_2_3 server menolak percakapan (409): alur pengaduan dihentikan dan tidak diulang', async () => {
  const gerbang = new GerbangPengaduanTiruan();
  gerbang.terbitkanTiket = async () => { throw new PercakapanDitolak(); };
  const { pengaduan } = rakitan({ gerbang });
  await assert.rejects(pengaduan.tangani(ID, UCAPAN_LENGKAP), PercakapanDitolak);
  assert.ok(!pengaduan.aktif(ID));
});

test('req_2_5 server menolak penyimpanan tidak lengkap (409): dianggap tidak tersimpan', async () => {
  const gerbang = new GerbangPengaduanTiruan();
  gerbang.simpanTidakLengkap = async () => { throw new PercakapanDitolak(); };
  const { pengaduan } = rakitan({ gerbang });
  await pengaduan.tangani(ID, SRS_EXCEPTION);
  const hasil = await pengaduan.panggilanBerakhir(ID);
  assert.equal(hasil.tersimpan, false);
});

test('req_2_3 gerbang Supabase memetakan 409 menjadi PercakapanDitolak tanpa membocorkan isi respons', async () => {
  const asli = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 'error', message: 'x' }), { status: 409 });
  try {
    const g = new GerbangPengaduanSupabase('https://contoh.supabase.co', 'kunci-uji');
    await assert.rejects(g.simpanTidakLengkap({ percakapanId: ID }), PercakapanDitolak);
  } finally {
    globalThis.fetch = asli;
  }
});

test('req_2_3 gerbang tiruan: satu percakapan satu tiket, format ADU-YYYYMMDD-NNNN', async () => {
  const g = new GerbangPengaduanTiruan(() => new Date('2026-11-02T03:00:00Z'));
  const d = { percakapanId: ID, namaProduk: 'A', kronologi: 'b c d', namaPelapor: 'E', nomorTelepon: '081234567890' };
  assert.equal(await g.terbitkanTiket(d), 'ADU-20261102-0001');
  assert.equal(await g.terbitkanTiket(d), 'ADU-20261102-0001');
  assert.equal(await g.terbitkanTiket({ ...d, percakapanId: '7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b' }), 'ADU-20261102-0002');
  await assert.rejects(g.terbitkanTiket({ ...d, nomorTelepon: '' }));
});
