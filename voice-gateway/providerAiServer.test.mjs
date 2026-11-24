// REQ-4.7 di tingkat server: server.mjs dijalankan sungguhan dengan provider lokal (AI_PROVIDER_BAWAAN=lokal), profil Hermes
// cloud dan lokal tiruan, serta ElevenLabs tiruan. Memastikan kegagalan lokal diucapkan PESAN_LOKAL_MATI, eskalasi berjalan
// sampai tiket ESK terbit, dan profil cloud tidak pernah dipanggil, termasuk untuk ringkasan panggilan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { setTimeout as jeda } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { PESAN_LOKAL_MATI } from './providerAi.mjs';

const PERTANYAAN = 'Bagaimana cara mendaftarkan produk pangan olahan ke BPOM?';
const KALIMAT = ['Pendaftaran produk dilakukan secara daring. ', 'Siapkan dokumen perizinan usaha. ', 'Ajukan permohonan lewat situs registrasi. '];
const sse = (content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

const dengar = (server) => new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server.address().port)));

/** Hermes cloud, Hermes lokal, dan TTS tiruan dalam satu server. `lokal.mode` menentukan perilaku profil lokal. */
const tiruan = { cloud: 0, lokal: 0, mode: '500' };
const stub = createServer((req, res) => {
  req.resume();
  if (req.url.startsWith('/cloud/')) {
    tiruan.cloud++;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    return res.end(`${sse('Jawaban cloud.')}data: [DONE]\n\n`);
  }
  if (req.url.startsWith('/lokal/')) {
    tiruan.lokal++;
    if (tiruan.mode === '500') return res.writeHead(500).end();
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    // Aliran tanpa isi jawaban: Hermes selesai tanpa satu kalimat pun.
    if (tiruan.mode === 'kosong') return res.end('data: [DONE]\n\n');
    // Putus di tengah: beberapa kalimat sudah terkirim, lalu koneksi diputus tanpa akhir aliran.
    res.write(KALIMAT.map(sse).join(''));
    setTimeout(() => res.destroy(), 100);
    return undefined;
  }
  if (req.url.startsWith('/v1/text-to-speech/')) return res.writeHead(200, { 'content-type': 'audio/mpeg' }).end(Buffer.alloc(512));
  return res.writeHead(404).end();
});

let alamatStub;
const gateway = [];

/** Menjalankan server.mjs dengan provider lokal; `lingkungan` menimpa env bawaan. */
async function jalankanGateway(lingkungan = {}) {
  const cadang = createServer();
  const port = await dengar(cadang);
  await new Promise((ok) => cadang.close(ok));
  const anak = spawn(process.execPath, ['server.mjs'], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    stdio: ['ignore', 'ignore', 'ignore'],
    env: {
      ...process.env, NODE_ENV: 'test', PORT: String(port), SITE_ORIGIN: '', SUPABASE_URL: '', SIGAP_KUNCI_INTERNAL: '',
      CEKBPOM_AKTIF: '0', PENGETAHUAN_VEKTOR: '0', AI_PROVIDER_BAWAAN: 'lokal', OLLAMA_URL: '',
      HERMES_URL: `${alamatStub}/cloud`, HERMES_API_KEY: 'kunci-cloud', HERMES_LOKAL_URL: `${alamatStub}/lokal`, HERMES_LOKAL_API_KEY: 'kunci-lokal',
      ELEVENLABS_URL: alamatStub, ELEVENLABS_API_KEY: 'tiruan',
      ...lingkungan,
    },
  });
  gateway.push(anak);
  const url = `http://127.0.0.1:${port}`;
  for (const batas = Date.now() + 60_000; ;) {
    if (anak.exitCode !== null) throw new Error(`gateway berhenti dengan kode ${anak.exitCode}`);
    if (Date.now() > batas) throw new Error('gateway tidak menjawab /voice/kesehatan');
    if (await fetch(`${url}/voice/kesehatan`).then((r) => r.ok, () => false)) return url;
    await jeda(100);
  }
}

/** Satu giliran JSON; mengembalikan baris NDJSON (atau body JSON untuk pilihan menu). */
async function giliran(url, body) {
  const r = await fetch(`${url}/voice/giliran`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url }, body: JSON.stringify(body) });
  const teks = await r.text();
  assert.equal(r.status, 200, teks);
  return teks.trim().split('\n').map((b) => JSON.parse(b));
}

const kalimat = (baris) => baris.filter((b) => b.jenis === 'kalimat');

/** Pilih layanan informasi produk lalu ajukan pertanyaan yang sampai ke AI. */
async function tanya(url, id) {
  await giliran(url, { id, pilih: 1 });
  return giliran(url, { id, teks: PERTANYAAN });
}

before(async () => {
  alamatStub = `http://127.0.0.1:${await dengar(stub)}`;
});

after(() => {
  for (const anak of gateway) anak.kill();
  stub.close();
});

test('req_4_7 server: profil lokal 500 mengucapkan PESAN_LOKAL_MATI, tiket ESK terbit dari nomor berikutnya, cloud tidak dipanggil', async () => {
  const url = await jalankanGateway();
  const id = randomUUID();
  tiruan.mode = '500';
  const lokalSebelum = tiruan.lokal;
  const baris = await tanya(url, id);
  assert.ok(tiruan.lokal > lokalSebelum, 'giliran dikirim ke profil lokal');
  assert.deepEqual(kalimat(baris).map((b) => [b.teks, b.suara]), [[PESAN_LOKAL_MATI, '/voice/statis/lokal-mati']]);
  assert.equal(baris.at(-1).jenis, 'selesai');

  const tiket = await giliran(url, { id, teks: '081234567890' });
  assert.match(kalimat(tiket)[0].teks, /^Nomor tiket Anda ESK-\d{8}-\d{4}\./);
  assert.match(tiket.at(-1).tiket, /^ESK-\d{8}-\d{4}$/);

  const kesehatan = await fetch(`${url}/voice/kesehatan`).then((r) => r.json());
  assert.equal(kesehatan.data.hermes.sehat, false, 'kegagalan lokal tercatat di kondisi hermes');
  assert.equal(kesehatan.data.provider, 'lokal');

  // Ringkasan panggilan lokal juga tidak boleh ke cloud (peringkas lokal gagal 500, jatuh ke tiruan).
  await fetch(`${url}/voice/akhiri`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url }, body: JSON.stringify({ id }) });
  await jeda(300);
  assert.equal(tiruan.cloud, 0, 'profil cloud tidak pernah dipanggil');
});

test('req_4_7 server: jawaban lokal kosong dihitung gagal, bukan "belum bisa menjawab"', async () => {
  const url = await jalankanGateway();
  const id = randomUUID();
  tiruan.mode = 'kosong';
  const baris = await tanya(url, id);
  assert.deepEqual(kalimat(baris).map((b) => b.teks), [PESAN_LOKAL_MATI]);
  const tiket = await giliran(url, { id, teks: '081234567890' });
  assert.match(tiket.at(-1).tiket, /^ESK-\d{8}-\d{4}$/);
  const kesehatan = await fetch(`${url}/voice/kesehatan`).then((r) => r.json());
  assert.equal(kesehatan.data.hermes.sehat, false);
  assert.equal(tiruan.cloud, 0);
});

test('req_4_7 server: profil lokal putus di tengah jawaban mengirim ganti lalu PESAN_LOKAL_MATI', async () => {
  const url = await jalankanGateway();
  tiruan.mode = 'putus';
  const baris = await tanya(url, randomUUID());
  const iGanti = baris.findIndex((b) => b.jenis === 'ganti');
  const iPesan = baris.findIndex((b) => b.jenis === 'kalimat' && b.teks === PESAN_LOKAL_MATI);
  assert.ok(iGanti > 0 && iPesan > iGanti, JSON.stringify(baris));
  assert.ok(kalimat(baris).length > 1, 'sebagian jawaban lokal sempat terkirim sebelum putus');
  assert.equal(tiruan.cloud, 0);
});

test('req_4_7 server: mode lokal tanpa HERMES_LOKAL_URL mengucapkan PESAN_LOKAL_MATI dan mencatat hermes gagal', async () => {
  const url = await jalankanGateway({ HERMES_LOKAL_URL: '' });
  const id = randomUUID();
  const baris = await tanya(url, id);
  assert.deepEqual(kalimat(baris).map((b) => [b.teks, b.suara]), [[PESAN_LOKAL_MATI, '/voice/statis/lokal-mati']]);
  const tiket = await giliran(url, { id, teks: '081234567890' });
  assert.match(tiket.at(-1).tiket, /^ESK-\d{8}-\d{4}$/);
  const kesehatan = await fetch(`${url}/voice/kesehatan`).then((r) => r.json());
  assert.equal(kesehatan.data.hermes.sehat, false);
  assert.equal(tiruan.cloud, 0);
});
