import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PelaporPanggilanTiruan, PemantauPanggilan, TAHAP } from './panggilanAktif.mjs';
import { PEMBICARA, PencatatTranskrip, PengirimTranskripSupabase, PengirimTranskripTiruan } from './transkrip.mjs';
import { PESAN_LAYANAN_1 } from './percakapan.mjs';

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const ID2 = '7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const tunggu = () => new Promise((r) => setImmediate(r));

function siapkan(opsi = {}) {
  const pengirim = new PengirimTranskripTiruan();
  const galat = [];
  const pencatat = new PencatatTranskrip({ pengirim, onGalat: (e) => galat.push(e), ...opsi });
  const ucapan = (id = ID) => pengirim.percakapan.get(id)?.ucapan ?? [];
  return { pengirim, pencatat, galat, ucapan };
}

test('nfr_20 catatan ditahan sampai baris percakapan ada, lalu ucapan tersimpan berurutan', async () => {
  const { pencatat, ucapan } = siapkan();
  // Pilihan menu terjadi sebelum giliran suara pertama, jadi baris percakapan belum dibuat.
  pencatat.giliran(ID, null, PESAN_LAYANAN_1);
  await tunggu();
  assert.deepEqual(ucapan(), [], 'belum ada baris percakapan: belum ada yang dikirim');
  pencatat.tercatat(ID);
  pencatat.giliran(ID, 'Susu Formula Sehat', 'Susu Formula Sehat terdaftar.');
  await tunggu();
  assert.deepEqual(ucapan(), [
    { urutan: 1, pembicara: PEMBICARA.SISTEM, teks: PESAN_LAYANAN_1 },
    { urutan: 2, pembicara: PEMBICARA.PENELEPON, teks: 'Susu Formula Sehat' },
    { urutan: 3, pembicara: PEMBICARA.SISTEM, teks: 'Susu Formula Sehat terdaftar.' },
  ]);
});

test('nfr_20 pengirim lambat: hanya satu kiriman berjalan per panggilan dan urutan tetap', async () => {
  const terkirim = [];
  let berjalan = 0, puncak = 0;
  const pencatat = new PencatatTranskrip({
    pengirim: {
      async kirim(d) {
        berjalan += 1;
        puncak = Math.max(puncak, berjalan);
        await new Promise((r) => setTimeout(r, 5));
        terkirim.push(d.teks);
        berjalan -= 1;
      },
    },
  });
  pencatat.tercatat(ID);
  pencatat.giliran(ID, 'satu', 'dua');
  await new Promise((r) => setTimeout(r, 1));
  pencatat.giliran(ID, 'tiga', 'empat');
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(terkirim, ['satu', 'dua', 'tiga', 'empat']);
  assert.equal(puncak, 1);
});

test('nfr_20 galat pengirim tidak melempar ke giliran, dicatat, dan catatan berikutnya tetap dikirim', async () => {
  const terkirim = [];
  const galat = [];
  const pencatat = new PencatatTranskrip({
    pengirim: { async kirim(d) { if (d.teks === 'gagal') throw new Error('transkrip 500'); terkirim.push(d.teks); } },
    onGalat: (e) => galat.push(e.message),
  });
  pencatat.tercatat(ID);
  assert.doesNotThrow(() => pencatat.giliran(ID, 'gagal', 'berhasil'));
  await tunggu();
  assert.deepEqual(terkirim, ['berhasil']);
  assert.deepEqual(galat, ['transkrip 500']);
});

test('t_f5_4_01 log tool hanya berisi nama, durasi, dan berhasil tidaknya', async () => {
  const { pencatat, pengirim } = siapkan();
  pencatat.tercatat(ID);
  pencatat.tool(ID, 'cek_registrasi_bpom', 812.6, true);
  pencatat.tool(ID, 'cari_basis_pengetahuan', -3, undefined);
  await tunggu();
  assert.deepEqual(pengirim.percakapan.get(ID).tool, [
    { namaTool: 'cek_registrasi_bpom', durasiMs: 813, berhasil: true },
    { namaTool: 'cari_basis_pengetahuan', durasiMs: 0, berhasil: false },
  ]);
});

test('nfr_20 akhiri menyelesaikan kiriman yang berjalan lalu melupakan sesi; tanpa baris percakapan catatan dibuang', async () => {
  const { pencatat, ucapan } = siapkan();
  pencatat.tercatat(ID);
  pencatat.giliran(ID, 'Tidak, terima kasih.', 'Terima kasih sudah menghubungi HaloBPOM. Percakapan ini saya tutup ya.');
  pencatat.akhiri(ID);
  await tunggu();
  assert.equal(ucapan().length, 2, 'jawaban penutup tetap tersimpan walau panggilan diakhiri');
  assert.equal(pencatat.sesi.has(ID), false);

  pencatat.giliran(ID2, null, PESAN_LAYANAN_1);
  pencatat.akhiri(ID2);
  pencatat.tercatat(ID2);
  await tunggu();
  assert.deepEqual(ucapan(ID2), [], 'penelepon menutup sebelum giliran suara pertama: tidak ada baris percakapan');
});

test('nfr_privasi jumlah sesi dan antrean dibatasi tanpa melempar', async () => {
  const { pencatat, galat } = siapkan({ maks: 2, antreanMaks: 2 });
  pencatat.giliran(ID, 'a', 'b');
  pencatat.giliran(ID, 'c', null);
  assert.equal(pencatat.sesi.get(ID).antrean.length, 2);
  assert.equal(galat.length, 1);
  pencatat.giliran(ID2, 'a', null);
  pencatat.giliran('8f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', 'a', null);
  assert.equal(pencatat.sesi.size, 2, 'sesi tertua yang diam digeser');
  assert.equal(pencatat.sesi.has(ID), false);
});

test('nfr_privasi banjir pilihan menu dengan id acak tidak menggeser panggilan yang sudah tercatat', async () => {
  const pencatat = new PencatatTranskrip({ pengirim: { kirim: () => new Promise(() => {}) }, maks: 3 });
  pencatat.tercatat(ID);
  pencatat.giliran(ID, 'satu', 'dua');
  pencatat.tercatat(ID2);
  for (let i = 0; i < 10; i++) pencatat.giliran(`acak-${i}`, null, PESAN_LAYANAN_1);
  assert.equal(pencatat.sesi.size, 3);
  assert.ok(pencatat.sesi.has(ID) && pencatat.sesi.has(ID2), 'panggilan tercatat tetap ada');
  assert.ok(pencatat.sesi.has('acak-9'));
});

test('nfr_20 laporan panggilan aktif yang berhasil membuka pencatatan transkrip', async () => {
  const { pencatat, ucapan } = siapkan();
  const pantau = new PemantauPanggilan({ pelapor: new PelaporPanggilanTiruan(), saatTercatat: (id) => pencatat.tercatat(id) });
  pencatat.giliran(ID, null, PESAN_LAYANAN_1);
  pantau.tahap(ID, TAHAP.MENDENGAR);
  await tunggu();
  await tunggu();
  assert.deepEqual(ucapan().map((u) => u.teks), [PESAN_LAYANAN_1]);
});

test('pengirim supabase memakai kunci internal bersama, tanpa service_role, ke Edge Function catat-percakapan', async () => {
  const permintaan = [];
  const asli = globalThis.fetch;
  globalThis.fetch = async (url, init) => { permintaan.push({ url, init }); return new Response('{}', { status: permintaan.length === 1 ? 200 : 404 }); };
  try {
    const p = new PengirimTranskripSupabase('https://x.supabase.co/', 'kunci-uji');
    await p.kirim({ aksi: 'ucapan', percakapanId: ID, pembicara: 'penelepon', teks: 'halo' });
    await assert.rejects(() => p.kirim({ aksi: 'tool', percakapanId: ID, namaTool: 'cek_registrasi_bpom', durasiMs: 5, berhasil: true }), /transkrip 404/);
  } finally {
    globalThis.fetch = asli;
  }
  assert.equal(permintaan[0].url, 'https://x.supabase.co/functions/v1/catat-percakapan');
  assert.equal(permintaan[0].init.headers['x-sigap-kunci'], 'kunci-uji');
  assert.equal(permintaan[0].init.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(permintaan[0].init.body), { aksi: 'ucapan', percakapanId: ID, pembicara: 'penelepon', teks: 'halo' });
});

test('nfr_20 setiap kalimat yang diucapkan di server.mjs ikut tercatat di transkrip bersama ucapan penelepon', () => {
  const server = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
  // Giliran suara dan ketik: semua kalimat lewat ucapkan(), dikumpulkan, lalu dicatat sekali di finally untuk semua jalur.
  assert.match(server, /const ucapkan = \(teks, suara\) => \{ (?:tKalimat1 \?\?= Date\.now\(\) - mulai; )?terucap\.push\(teks\); tulis\(\{ jenis: 'kalimat', teks, suara \}\); \};/);
  assert.equal(server.match(/jenis: 'kalimat'/g)?.length, 1);
  assert.match(server, /\} finally \{\n {6}pencatat\.giliran\(id, transkrip, terucap\.join\(' '\)\);/);
  // Kalimat yang dibuang panel ("ganti") tidak ikut tercatat.
  assert.match(server, /tulis\(\{ jenis: 'ganti' \}\);\n {8}terucap\.length = 0;/);
  // Pilihan menu: menu dan jawabannya dicatat; balasan JSON lain tidak memuat jawaban yang diucapkan.
  assert.match(server, /pencatat\.giliran\(id, null, PESAN_MENU\);\n {6}pencatat\.giliran\(id, null, menu\.jawaban\);/);
  const balasan = server.match(/kirim\(res, 200, 'success', 'OK', \{[^}]*\bjawaban\b[^}]*\}/g) ?? [];
  assert.deepEqual(balasan, ["kirim(res, 200, 'success', 'OK', { transkrip: null, jawaban: menu.jawaban, suara: menu.suara }"]);
});
