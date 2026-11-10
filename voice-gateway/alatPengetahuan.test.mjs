import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFINISI_TOOL, NAMA_TOOL, PencariPengetahuanSupabase, cariBasisPengetahuan, kalimatSumber, pesanBasisPengetahuan, sumberUntukPanel,
} from './alatPengetahuan.mjs';
import { PESAN_BUTUH_PETUGAS } from './eskalasi.mjs';
import { PESAN_DI_LUAR_TOPIK, PESAN_TAWARAN_PENUTUP } from './percakapan.mjs';

const POTONGAN = { teks: 'Label gizi wajib dicantumkan pada pangan olahan.', judul: 'Label Pangan Olahan', rujukanSumber: 'Peraturan BPOM Nomor 26 Tahun 2021', skor: 0.82 };

function ambilTiruan(balasan, log = []) {
  return async (url, opsi) => {
    log.push({ url, opsi });
    if (balasan instanceof Error) throw balasan;
    return Response.json(balasan.badan, { status: balasan.kode ?? 200 });
  };
}

test('t_f1_3_03 definisi tool bernama cari_basis_pengetahuan dengan parameter pertanyaan', () => {
  assert.equal(NAMA_TOOL, 'cari_basis_pengetahuan');
  assert.equal(DEFINISI_TOOL.function.name, 'cari_basis_pengetahuan');
  assert.deepEqual(DEFINISI_TOOL.function.parameters.required, ['pertanyaan']);
});

test('t_f1_3_03 pencari memanggil cari-pengetahuan dengan x-sigap-kunci dan mengembalikan judul, rujukan, cuplikan', async () => {
  const log = [];
  const pencari = new PencariPengetahuanSupabase('https://x.supabase.co/', 'kunci-uji', ambilTiruan({ badan: { status: 'success', message: 'OK', data: { potongan: [POTONGAN] } } }, log));
  const hasil = await pencari.cari('Apa kewajiban label gizi?');
  assert.equal(log[0].url, 'https://x.supabase.co/functions/v1/cari-pengetahuan');
  assert.equal(log[0].opsi.headers['x-sigap-kunci'], 'kunci-uji');
  assert.equal(log[0].opsi.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(log[0].opsi.body), { pertanyaan: 'Apa kewajiban label gizi?' });
  assert.deepEqual(hasil, [POTONGAN]);
});

test('t_f1_3_03 cuplikan dipotong dan potongan tidak lengkap dibuang', async () => {
  const panjang = { ...POTONGAN, teks: 'a'.repeat(2000) };
  const pencari = new PencariPengetahuanSupabase('https://x.supabase.co', 'k', ambilTiruan({ badan: { data: { potongan: [panjang, { judul: 'tanpa teks' }] } } }));
  const hasil = await pencari.cari('label');
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].teks.length, 700);
});

test('t_f1_3_03 pencari gagal pada respons galat', async () => {
  const pencari = new PencariPengetahuanSupabase('https://x.supabase.co', 'k', ambilTiruan({ kode: 401, badan: { status: 'error', message: 'Akses ditolak.', data: null } }));
  await assert.rejects(pencari.cari('label'), /401/);
});

test('t_f1_3_03 hasil basis dipakai apa adanya, termasuk kosong, tanpa jatuh ke korpus lokal', async () => {
  let dipanggilLokal = 0;
  const korpus = { cari: () => { dipanggilLokal++; return [{ judul: 'Materi nonaktif', label: 'X', sumber: '', teks: 't' }]; } };
  const ada = await cariBasisPengetahuan({ pencari: { cari: async () => [POTONGAN] }, korpus, pertanyaan: 'label gizi' });
  assert.equal(ada.mode, 'basis');
  assert.deepEqual(ada.kutipan.map((k) => [k.judul, k.label]), [['Label Pangan Olahan', 'Peraturan BPOM Nomor 26 Tahun 2021']]);
  const kosong = await cariBasisPengetahuan({ pencari: { cari: async () => [] }, korpus, pertanyaan: 'label gizi' });
  assert.deepEqual(kosong, { mode: 'basis', kutipan: [] });
  assert.equal(dipanggilLokal, 0);
});

test('t_f1_3_03 fallback ke korpus lokal bila Edge Function gagal, dan log tanpa pertanyaan', async () => {
  const lokal = [{ judul: 'Lokal', label: 'Peraturan BPOM Nomor 12 Tahun 2025', sumber: 'https://u', teks: 'isi' }];
  const catatan = [];
  const hasil = await cariBasisPengetahuan({
    pencari: { cari: async () => { throw new Error('cari-pengetahuan 503'); } },
    korpus: { cari: () => lokal }, pertanyaan: 'pertanyaan rahasia penelepon', catat: (e) => catatan.push(e),
  });
  assert.deepEqual(hasil, { mode: 'lokal', kutipan: lokal });
  assert.deepEqual(catatan, [{ ev: 'tool_pengetahuan_gagal', galat: 'cari-pengetahuan 503' }]);
  assert.ok(!JSON.stringify(catatan).includes('rahasia'));
});

test('t_f5_4_01 hanya pencarian BM25 lokal yang dilaporkan untuk log_tool; jalur vektor dicatat Edge Function', async () => {
  const lokal = [];
  const saatLokal = (ms, berhasil) => lokal.push(berhasil);
  const korpus = { cari: () => [] };
  await cariBasisPengetahuan({ pencari: { cari: async () => [POTONGAN] }, korpus, pertanyaan: 'q', saatLokal });
  assert.deepEqual(lokal, [], 'pencarian vektor tidak dicatat gateway');
  await cariBasisPengetahuan({ pencari: { cari: async () => { throw new Error('cari-pengetahuan 503'); } }, korpus, pertanyaan: 'q', saatLokal });
  await cariBasisPengetahuan({ pencari: null, korpus: null, pertanyaan: 'q', saatLokal });
  assert.deepEqual(lokal, [true, false], 'BM25 sesudah vektor gagal tercatat; tanpa korpus tercatat gagal');
});

test('t_f1_3_03 tanpa pencari dikonfigurasi dipakai korpus lokal; tanpa keduanya kosong', async () => {
  const lokal = [{ judul: 'Lokal', label: 'L', sumber: '', teks: 'isi' }];
  assert.deepEqual(await cariBasisPengetahuan({ pencari: null, korpus: { cari: () => lokal }, pertanyaan: 'q' }), { mode: 'lokal', kutipan: lokal });
  assert.deepEqual(await cariBasisPengetahuan({ pencari: null, korpus: null, pertanyaan: 'q' }), { mode: 'lokal', kutipan: [] });
});

test('t_f1_3_03 pesan agen meminta penutup Sumber, memuat rujukan, dan pesan baku di luar topik', () => {
  const pesan = pesanBasisPengetahuan([{ judul: 'Label Pangan Olahan', label: 'Peraturan BPOM Nomor 26 Tahun 2021', sumber: '', teks: POTONGAN.teks }]);
  assert.ok(pesan.includes('"Sumber: <rujukan>"'));
  // Sumber ditutup lebih dulu, baru tawaran penutup dari prompt sistem, agar keduanya tidak bersaing.
  assert.ok(pesan.includes(PESAN_TAWARAN_PENUTUP));
  assert.ok(pesan.indexOf('"Sumber: <rujukan>"') < pesan.indexOf(PESAN_TAWARAN_PENUTUP));
  assert.ok(pesan.includes('Rujukan: Peraturan BPOM Nomor 26 Tahun 2021'));
  assert.ok(pesan.includes(POTONGAN.teks));
  assert.ok(pesan.includes(PESAN_DI_LUAR_TOPIK));
  assert.equal(PESAN_DI_LUAR_TOPIK, 'Pertanyaan tersebut berada di luar cakupan layanan HaloBPOM.');
});

test('t_f1_3_03 hasil kosong masuk jalur eskalasi dan tidak boleh dijawab dari pengetahuan sendiri', () => {
  const pesan = pesanBasisPengetahuan([]);
  assert.ok(pesan.includes(PESAN_BUTUH_PETUGAS));
  assert.ok(pesan.includes('jangan menjawab dari pengetahuan sendiri'));
  assert.ok(pesan.includes(PESAN_DI_LUAR_TOPIK));
});

test('req_1_7 nfr_8 hasil kosong korpus lokal juga masuk jalur eskalasi, tidak dijawab tanpa sumber', async () => {
  const { mode, kutipan } = await cariBasisPengetahuan({ pencari: null, korpus: { cari: () => [] }, pertanyaan: 'apa itu BPOM' });
  assert.equal(mode, 'lokal');
  const pesan = pesanBasisPengetahuan(kutipan);
  assert.ok(pesan.includes(PESAN_BUTUH_PETUGAS));
  assert.ok(pesan.includes('jangan menjawab dari pengetahuan sendiri'));
});

test('req_1_7 kutipan yang tidak menjawab pertanyaan edukasi diarahkan ke pesan butuh petugas', () => {
  const pesan = pesanBasisPengetahuan([{ judul: 'Label Pangan Olahan', label: 'Peraturan BPOM Nomor 26 Tahun 2021', sumber: '', teks: POTONGAN.teks }]);
  assert.ok(pesan.includes(`tidak terjawab oleh potongan di bawah, jangan menjawab dari pengetahuan sendiri; jawab hanya dengan kalimat: ${PESAN_BUTUH_PETUGAS}`));
  assert.ok(pesan.includes('"Sumber: <rujukan>"'));
});

test('nfr_8 kalimat sumber disusun dari rujukan kutipan tanpa duplikat, sama dengan chip panel', () => {
  const k = (label) => ({ judul: 'J', label, sumber: '', teks: 't' });
  assert.equal(kalimatSumber([k('Peraturan BPOM Nomor 17 Tahun 2019')]), 'Sumber: Peraturan BPOM Nomor 17 Tahun 2019.');
  assert.equal(kalimatSumber([k('Peraturan BPOM Nomor 17 Tahun 2019'), k('Peraturan BPOM Nomor 17 Tahun 2019')]), 'Sumber: Peraturan BPOM Nomor 17 Tahun 2019.');
  const dua = [k('Peraturan BPOM Nomor 17 Tahun 2019'), k('Peraturan BPOM Nomor 26 Tahun 2021')];
  assert.equal(kalimatSumber(dua), 'Sumber: Peraturan BPOM Nomor 17 Tahun 2019 dan Peraturan BPOM Nomor 26 Tahun 2021.');
  assert.equal(kalimatSumber(dua), `Sumber: ${sumberUntukPanel(dua).map((s) => s.peraturan).join(' dan ')}.`);
  assert.equal(kalimatSumber([]), null);
});

test('t_f1_3_03 sumber untuk panel sama dengan rujukan materi yang dipakai', () => {
  assert.deepEqual(
    sumberUntukPanel([{ judul: 'Label Pangan Olahan', label: 'Peraturan BPOM Nomor 26 Tahun 2021', sumber: '', teks: 't' }]),
    [{ peraturan: 'Peraturan BPOM Nomor 26 Tahun 2021', judul: 'Label Pangan Olahan', url: '' }],
  );
});
