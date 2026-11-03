import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PelaporPanggilanSupabase, PelaporPanggilanTiruan, PemantauPanggilan, TAHAP, TOPIK, ringkasanPanggilan } from './panggilanAktif.mjs';

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const ID2 = '7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function siapkan(opsi = {}) {
  const jam = { t: 1_000_000 };
  const now = () => jam.t;
  const pelapor = new PelaporPanggilanTiruan(now);
  let konteks = { layanan: null, eskalasi: false };
  const galat = [];
  const pantau = new PemantauPanggilan({ pelapor, now, konteks: () => konteks, onGalat: (e) => galat.push(e), ...opsi });
  const maju = async (ms) => { jam.t += ms; pantau.tik(); await new Promise((r) => setImmediate(r)); };
  const tunggu = () => new Promise((r) => setImmediate(r));
  return { jam, pelapor, pantau, galat, maju, tunggu, atur: (k) => { konteks = k; } };
}

test('req_4_2 panggilan aktif tercatat dengan tahap terbaru lalu hilang setelah berakhir', async () => {
  const { pelapor, pantau, tunggu, maju, atur } = siapkan();
  atur({ layanan: 1 });
  pantau.tahap(ID, TAHAP.MENDENGAR);
  await tunggu();
  assert.equal(pelapor.daftarAktif().length, 1);
  assert.equal(pelapor.daftarAktif()[0].tahap, 'mendengar');
  assert.equal(pelapor.daftarAktif()[0].jenisLayanan, 'informasi_produk');
  assert.equal(pelapor.daftarAktif()[0].topik, TOPIK.INFORMASI);

  await maju(2_500);
  pantau.tahap(ID, TAHAP.MEMPROSES);
  await maju(2_500);
  pantau.tahap(ID, TAHAP.MENJAWAB);
  await tunggu();
  assert.equal(pelapor.daftarAktif()[0].tahap, 'menjawab');

  await pantau.akhiri(ID);
  assert.deepEqual(pelapor.daftarAktif(), []);
});

test('req_4_2 panggilan yatim hilang dari daftar aktif saat heartbeat berhenti', async () => {
  const { jam, pelapor, pantau, tunggu } = siapkan();
  pantau.tahap(ID, TAHAP.MENDENGAR);
  await tunggu();
  assert.equal(pelapor.daftarAktif().length, 1);
  // Gateway mati atau jaringan putus: tidak ada lagi tik. Batas heartbeat lewat.
  jam.t += 61_000;
  assert.deepEqual(pelapor.daftarAktif(), []);
});

test('req_4_2 heartbeat berkala menjaga panggilan tetap aktif selama ada aktivitas lalu berhenti saat diam', async () => {
  const { pelapor, pantau, maju, tunggu } = siapkan({ heartbeatMs: 15_000, diamMs: 90_000 });
  pantau.tahap(ID, TAHAP.MENJAWAB);
  await tunggu();
  const tulisAwal = pelapor.jumlahTulis;
  await maju(10_000);
  assert.equal(pelapor.jumlahTulis, tulisAwal, 'belum waktunya heartbeat');
  await maju(6_000);
  assert.equal(pelapor.jumlahTulis, tulisAwal + 1, 'heartbeat terkirim');
  await maju(60_000);
  assert.equal(pelapor.daftarAktif().length, 1, 'tetap aktif selama heartbeat berjalan');
  const tulisSaatDiam = pelapor.jumlahTulis;
  await maju(30_000);
  await maju(31_000);
  assert.equal(pelapor.jumlahTulis, tulisSaatDiam, 'tidak ada heartbeat maupun akhiri setelah diam melewati batas');
  assert.deepEqual(pelapor.daftarAktif(), [], 'hilang dari daftar aktif setelah heartbeat berhenti');
});

test('req_4_2 penelepon yang diam lama lalu berbicara lagi tetap tercatat sebagai panggilan aktif', async () => {
  const { pelapor, pantau, maju, tunggu } = siapkan({ heartbeatMs: 15_000, diamMs: 90_000 });
  pantau.tahap(ID, TAHAP.MENJAWAB);
  await tunggu();
  for (let i = 0; i < 7; i++) await maju(15_000); // diam 105 detik, melewati diamMs
  pantau.tahap(ID, TAHAP.MENDENGAR);
  await tunggu();
  assert.equal(pelapor.daftarAktif().length, 1, 'panggilan tidak ditutup permanen karena diam');
  assert.equal(pelapor.daftarAktif()[0].tahap, 'mendengar');
});

test('req_4_2 penulisan di-throttle: perubahan tahap beruntun tidak ditulis satu per satu', async () => {
  const { pelapor, pantau, maju, tunggu } = siapkan({ jedaMinMs: 2_000 });
  pantau.tahap(ID, TAHAP.MENDENGAR);
  pantau.tahap(ID, TAHAP.MEMPROSES);
  pantau.tahap(ID, TAHAP.MENJAWAB);
  for (let i = 0; i < 100; i++) pantau.tahap(ID, TAHAP.MENJAWAB);
  await tunggu();
  assert.equal(pelapor.jumlahTulis, 1);
  assert.equal(pelapor.daftarAktif()[0].tahap, 'mendengar');
  await maju(2_100);
  assert.equal(pelapor.jumlahTulis, 2);
  assert.equal(pelapor.daftarAktif()[0].tahap, 'menjawab', 'tahap terbaru yang tertunda akhirnya ditulis');
});

test('req_4_2 jenis layanan dan topik baku dari keadaan panggilan tanpa isi ucapan', () => {
  assert.deepEqual(ringkasanPanggilan({}), { jenisLayanan: null, topik: null });
  assert.deepEqual(ringkasanPanggilan({ layanan: 2 }), { jenisLayanan: 'pengaduan', topik: TOPIK.PENGADUAN });
  assert.deepEqual(ringkasanPanggilan({ layanan: 1, eskalasi: true }), { jenisLayanan: 'informasi_produk', topik: TOPIK.ESKALASI });
});

test('req_4_2 galat pelapor tidak melempar dan dicoba lagi pada tik berikutnya', async () => {
  const { jam, pantau, galat, tunggu, maju } = siapkan();
  let gagal = true;
  const dikirim = [];
  pantau.pelapor = {
    async laporkan(d) { if (gagal) throw new Error('jaringan'); dikirim.push(d); },
    async akhiri() { throw new Error('jaringan'); },
  };
  pantau.tahap(ID, TAHAP.MENDENGAR);
  await tunggu();
  assert.equal(galat.length, 1);
  gagal = false;
  await maju(2_100);
  assert.equal(dikirim.length, 1);
  assert.equal(dikirim[0].tahap, 'mendengar');
  await pantau.akhiri(ID); // galat ditelan
  assert.equal(galat.length, 2);
  assert.ok(jam.t > 0);
});

test('req_4_2 akhiri menunggu laporan yang masih di jalan agar tidak ada baris berjalan baru setelah ditutup', async () => {
  const { pantau, tunggu } = siapkan();
  const urutan = [];
  let lepas;
  pantau.pelapor = {
    laporkan: () => new Promise((r) => { lepas = () => { urutan.push('laporkan'); r(); }; }),
    async akhiri() { urutan.push('akhiri'); },
  };
  pantau.tahap(ID, TAHAP.MENDENGAR);
  const selesai = pantau.akhiri(ID);
  await tunggu();
  assert.deepEqual(urutan, [], 'akhiri belum dikirim selama laporan pertama belum selesai');
  lepas();
  await selesai;
  assert.deepEqual(urutan, ['laporkan', 'akhiri']);
});

test('nfr_privasi jumlah panggilan terlacak dibatasi dan tidak ada data pribadi dalam laporan', async () => {
  const { pelapor, pantau, tunggu } = siapkan({ maks: 2 });
  pantau.tahap(ID, TAHAP.MENDENGAR);
  pantau.tahap(ID2, TAHAP.MENDENGAR);
  pantau.tahap('8f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', TAHAP.MENDENGAR);
  await tunggu();
  assert.equal(pelapor.daftarAktif().length, 2);
  assert.deepEqual(Object.keys(pelapor.daftarAktif()[0]).sort(), ['heartbeat', 'jenisLayanan', 'mulai', 'percakapanId', 'selesai', 'tahap', 'topik']);
});

test('pelapor supabase memakai kunci internal bersama, tanpa service_role, dan hanya mengirim data minimal', async () => {
  const permintaan = [];
  const asli = globalThis.fetch;
  globalThis.fetch = async (url, init) => { permintaan.push({ url, init }); return new Response('{}', { status: 200 }); };
  try {
    const p = new PelaporPanggilanSupabase('https://x.supabase.co/', 'kunci-uji');
    await p.laporkan({ percakapanId: ID, jenisLayanan: 'pengaduan', topik: TOPIK.PENGADUAN, tahap: 'memproses' });
    await p.akhiri(ID);
  } finally {
    globalThis.fetch = asli;
  }
  assert.equal(permintaan[0].url, 'https://x.supabase.co/functions/v1/laporkan-panggilan-aktif');
  assert.equal(permintaan[0].init.headers['x-sigap-kunci'], 'kunci-uji');
  assert.equal(permintaan[0].init.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(permintaan[0].init.body), { aksi: 'laporkan', percakapanId: ID, jenisLayanan: 'pengaduan', topik: 'Pengaduan produk', tahap: 'memproses' });
  assert.deepEqual(JSON.parse(permintaan[1].init.body), { aksi: 'akhiri', percakapanId: ID });
});
