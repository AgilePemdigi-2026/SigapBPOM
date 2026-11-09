import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AnggaranToken } from './percakapan.mjs';
import { PengirimTranskripTiruan } from './transkrip.mjs';
import {
  PANJANG_MAKS_RINGKASAN, PeringkasHermes, PeringkasPercakapan, PeringkasTiruan, TANDA_NAMA, TANDA_NOMOR, samarkanDataPribadi,
} from './ringkasan.mjs';

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

/** Peringkas palsu: menyimpan transkrip yang dikirim ke "model" dan mengembalikan jawaban yang ditentukan. */
function peringkasPalsu(jawab = () => ({ ringkasan: 'Penelepon mengadukan Krim Glowing yang membuat kulit gatal.', token: 900 })) {
  const masuk = [];
  return { masuk, async ringkas(t) { masuk.push(t); return jawab(t); } };
}

function siapkan({ peringkas = peringkasPalsu(), anggaran = null, dataPribadi = () => [] } = {}) {
  const pengirim = new PengirimTranskripTiruan();
  const galat = [];
  const p = new PeringkasPercakapan({ peringkas, pengirim, anggaran, dataPribadi, onGalat: (e) => galat.push(e) });
  return { p, pengirim, peringkas, galat, ringkasan: () => pengirim.percakapan.get(ID)?.ringkasan };
}

test('nfr_13 nomor telepon berupa angka maupun kata dan nama pelapor disamarkan', () => {
  const nama = ['Susan Greenfield'];
  for (const [masuk, keluar] of [
    ['Nomor saya 081234567890.', `Nomor saya ${TANDA_NOMOR}.`],
    ['nomornya 0812 3456 7890 ya', `nomornya ${TANDA_NOMOR} ya`],
    ['Kosong delapan dua satu tiga satu tujuh tiga empat belas kosong enam', TANDA_NOMOR],
    ['plus enam dua delapan satu dua tiga empat lima enam', TANDA_NOMOR],
    ['Nama saya Susan Greenfield, produk Krim X', `Nama saya ${TANDA_NAMA}, produk Krim X`],
    ['susan bilang kulitnya gatal', `${TANDA_NAMA} bilang kulitnya gatal`],
  ]) assert.equal(samarkanDataPribadi(masuk, { nama }), keluar, masuk);
  // Angka pendek (dosis, jumlah, tanggal) dan nomor izin edar yang diawali huruf tetap utuh.
  for (const teks of ['minum dua tablet tiga kali sehari', 'tanggal 12 bulan 10', 'nomor izin edar MD 865009001234']) {
    assert.equal(samarkanDataPribadi(teks.replace('865009001234', 'abc'), { nama }), teks.replace('865009001234', 'abc'));
  }
});

test('req_5_2 panggilan uji berakhir dengan ringkasan tersimpan tanpa nomor telepon atau nama pelapor utuh', async () => {
  const anggaran = new AnggaranToken({ harian: 100_000, harianPerIp: 50_000, perPanggilan: 20_000 });
  let data = [];
  const { p, peringkas, ringkasan, galat } = siapkan({ anggaran, dataPribadi: () => data });
  p.tercatat(ID);
  p.giliran(ID, '', null, 'Silakan pilih layanan.');
  p.giliran(ID, '1.2.3.4', 'Saya mau mengadu, nama saya Susan Greenfield, produk Krim Glowing', 'Mohon sebutkan nomor telepon Anda.');
  data = ['Susan Greenfield'];
  p.giliran(ID, '1.2.3.4', 'kosong delapan satu dua tiga empat lima enam tujuh delapan sembilan nol', 'Nomor tiket Anda ADU-20261105-0001.');
  data = [];
  const hasil = await p.akhiri(ID);

  assert.equal(hasil, 'Penelepon mengadukan Krim Glowing yang membuat kulit gatal.');
  assert.equal(ringkasan(), hasil);
  assert.equal(galat.length, 0);
  // Yang dikirim ke model sudah tanpa nama dan nomor pelapor.
  const keModel = peringkas.masuk[0];
  assert.doesNotMatch(keModel, /Susan|Greenfield|kosong delapan satu dua/i);
  assert.match(keModel, /\[nama pelapor\]/);
  assert.match(keModel, /\[nomor telepon\]/);
  assert.match(keModel, /ADU-20261105-0001/);
  // Token peringkasan masuk anggaran AI penelepon.
  assert.equal(anggaran.total, 900);
  assert.equal(anggaran.perIp.get('1.2.3.4'), 900);
});

test('nfr_13 data pribadi yang tetap ditulis model disamarkan dan ringkasan dipotong', async () => {
  const peringkas = peringkasPalsu(() => ({ ringkasan: `Susan Greenfield (081234567890) mengadukan krim. ${'x'.repeat(600)}`, token: 10 }));
  const { p, ringkasan } = siapkan({ peringkas, dataPribadi: () => ['Susan Greenfield', '081234567890'] });
  p.tercatat(ID);
  p.giliran(ID, '', 'krim saya bikin gatal', 'Baik.');
  await p.akhiri(ID);
  assert.ok(ringkasan().startsWith(`${TANDA_NAMA} (${TANDA_NOMOR}) mengadukan krim.`));
  assert.ok(ringkasan().length <= PANJANG_MAKS_RINGKASAN);
});

test('req_5_2 gagal meringkas tidak melempar dan tidak menyimpan apa pun; tokennya tetap dihitung', async () => {
  const anggaran = new AnggaranToken({ harian: 100_000, harianPerIp: 50_000, perPanggilan: 20_000 });
  for (const peringkas of [
    peringkasPalsu(() => { throw new Error('ringkasan 502'); }),
    peringkasPalsu(() => ({ ringkasan: '', token: 300 })),
  ]) {
    const { p, ringkasan, galat } = siapkan({ peringkas, anggaran });
    p.tercatat(ID);
    p.giliran(ID, '9.9.9.9', 'apakah paracetamol terdaftar', 'Paracetamol terdaftar.');
    assert.equal(await p.akhiri(ID), null);
    assert.equal(ringkasan(), undefined);
    assert.ok(galat.length <= 1);
  }
  assert.equal(anggaran.total, 300);
});

test('req_5_2 pengirim yang gagal hanya dilaporkan ke onGalat', async () => {
  const peringkas = peringkasPalsu();
  const galat = [];
  const p = new PeringkasPercakapan({ peringkas, pengirim: { async kirim() { throw new Error('transkrip 404'); } }, onGalat: (e) => galat.push(e) });
  p.tercatat(ID);
  p.giliran(ID, '', 'halo', 'Halo.');
  assert.equal(await p.akhiri(ID), null);
  assert.equal(galat[0].message, 'transkrip 404');
});

test('req_5_2 panggilan tanpa baris percakapan, tanpa ucapan penelepon, atau anggaran harian habis tidak diringkas', async () => {
  // Belum tercatat: baris percakapan tidak ada di basis data.
  let s = siapkan();
  s.p.giliran(ID, '', 'halo', 'Halo.');
  assert.equal(await s.p.akhiri(ID), null);
  assert.equal(s.peringkas.masuk.length, 0);
  // Hanya menu yang terucap.
  s = siapkan();
  s.p.tercatat(ID);
  s.p.giliran(ID, '', null, 'Silakan pilih layanan.');
  assert.equal(await s.p.akhiri(ID), null);
  assert.equal(s.peringkas.masuk.length, 0);
  // Anggaran harian habis.
  const anggaran = new AnggaranToken({ harian: 10, harianPerIp: 10, perPanggilan: 10 });
  anggaran.catat('1.1.1.1', 'lain', 10);
  s = siapkan({ anggaran });
  s.p.tercatat(ID);
  s.p.giliran(ID, '1.1.1.1', 'halo', 'Halo.');
  assert.equal(await s.p.akhiri(ID), null);
  assert.equal(s.peringkas.masuk.length, 0);
  // Sesi dibuang setelah akhiri: akhiri kedua tidak meringkas lagi.
  s = siapkan();
  s.p.tercatat(ID);
  s.p.giliran(ID, '', 'halo', 'Halo.');
  await s.p.akhiri(ID);
  assert.equal(await s.p.akhiri(ID), null);
  assert.equal(s.peringkas.masuk.length, 1);
});

test('req_5_2 jumlah panggilan yang diingat dibatasi', () => {
  const p = new PeringkasPercakapan({ peringkas: new PeringkasTiruan(), pengirim: new PengirimTranskripTiruan(), maks: 2 });
  for (const id of ['a', 'b', 'c']) p.giliran(id, '', 'halo', 'Halo.');
  assert.equal(p.sesi.size, 2);
});

test('req_5_2 PeringkasHermes mengirim prompt ringkasan tanpa streaming dan membaca usage', async (t) => {
  const kiriman = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    kiriman.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content: ' Penelepon menanyakan izin edar. ' } }], usage: { total_tokens: 420 } }));
  });
  const h = new PeringkasHermes({ url: 'http://hermes:8642/', kunci: 'k', model: 'sigap-hermes' });
  assert.deepEqual(await h.ringkas('Penelepon: halo'), { ringkasan: 'Penelepon menanyakan izin edar.', token: 420 });
  assert.equal(kiriman[0].url, 'http://hermes:8642/v1/chat/completions');
  assert.equal(kiriman[0].body.stream, false);
  assert.equal(kiriman[0].body.messages[0].role, 'system');
  assert.equal(kiriman[0].body.messages[1].content, 'Penelepon: halo');

  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ choices: [{ message: { content: '⚠️ No reply' } }], usage: { total_tokens: 50 } })));
  assert.deepEqual(await h.ringkas('x'), { ringkasan: '', token: 50 });
  t.mock.method(globalThis, 'fetch', async () => new Response('gagal', { status: 502 }));
  await assert.rejects(() => h.ringkas('x'), /ringkasan 502/);
});

test('req_5_2 gateway memasang peringkasan pada akhir panggilan dan sesi yang dibuang, serta modul ikut image Docker', () => {
  const server = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
  assert.match(server, /path === '\/voice\/akhiri'[\s\S]*peringkas\.akhiri\(body\.id\)/);
  assert.match(server, /saatDibuang[\s\S]{0,200}peringkas\.akhiri\(id\)/);
  assert.match(server, /saatTercatat: \(id\) => \{ pencatat\.tercatat\(id\); peringkas\.tercatat\(id\); \}/);
  assert.doesNotMatch(server, /pencatat\.giliran\(id, (?:null|transkrip)/);
  assert.match(readFileSync(new URL('./Dockerfile', import.meta.url), 'utf8'), /voice-gateway\/ringkasan\.mjs/);
});
