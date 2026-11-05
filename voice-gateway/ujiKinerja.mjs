// Uji kinerja Voice Gateway (NFR-1, NFR-4, ADR 0005). Alat pengembang, tidak ikut image Docker.
//   node voice-gateway/ujiKinerja.mjs beban [--serentak 50] [--giliran 3] [--hermes-ms 1600] [--tts-ms 500] [--batas-ms 3000]
//   node voice-gateway/ujiKinerja.mjs beban --gateway https://<domain> [--serentak 1]
//   docker compose logs voice | node voice-gateway/ujiKinerja.mjs log
// Tanpa --gateway, server.mjs dijalankan dengan Hermes dan ElevenLabs tiruan, jadi tidak ada kuota penyedia yang terpakai.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { setTimeout as jeda } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PESAN_TAWARAN_PENUTUP } from './percakapan.mjs';

/** NFR-1: jawaban suara mulai paling lambat 3 detik pada 95% interaksi. NFR-4 memakai batas yang sama untuk 50 panggilan. */
export const BATAS_NFR_1_MS = 3000;
/** NFR-4: panggilan simultan minimum. */
const SERENTAK_NFR_4 = 50;
// Token pertama Hermes yang diukur di VPS (PR #44). Render TTS penuh satu kalimat adalah asumsi sampai diukur di VPS.
const HERMES_MS_BAWAAN = 1600;
const TTS_MS_BAWAAN = 500;
const BATAS_TUNGGU_GATEWAY_MS = 60_000;
// Kuota harian gateway dibuat tak terbatas: uji ini mengukur gateway, bukan kuota (lihat ADR 0005, Konsekuensi).
const KUOTA_TAK_TERBATAS = String(Number.MAX_SAFE_INTEGER);

// Pertanyaan F1 yang lolos saring topik, saring medis, dan deteksi penutup, jadi selalu sampai ke AI.
const PERTANYAAN = [
  'Bagaimana cara mendaftarkan produk pangan olahan ke BPOM?',
  'Apa arti kode MD dan ML pada kemasan pangan olahan?',
  'Berapa lama proses registrasi kosmetik di BPOM?',
];
const JAWABAN_TIRUAN = [
  'Pendaftaran produk dilakukan secara daring melalui situs registrasi BPOM. ',
  'Siapkan dokumen perizinan usaha dan data produk sebelum mengajukan permohonan. ',
  PESAN_TAWARAN_PENUTUP,
];
const AUDIO_TIRUAN = Buffer.alloc(8 * 1024);

/** p50, p95 (nearest-rank), dan maks; nilai null (tidak ada kalimat terucap) dihitung terpisah di `tanpa`. */
export function ringkas(nilaiMs, batasMs = BATAS_NFR_1_MS) {
  const urut = nilaiMs.filter((x) => x != null).sort((a, b) => a - b);
  const persentil = (p) => urut[Math.ceil((p / 100) * urut.length) - 1] ?? null;
  const p95 = persentil(95);
  return { n: urut.length, tanpa: nilaiMs.length - urut.length, p50: persentil(50), p95, maks: urut.at(-1) ?? null, lulus: p95 !== null && p95 <= batasMs };
}

/** Mode log: p95 kalimat1_ms dari baris ev 'respons' (awalan `docker compose logs` diabaikan). */
async function modeLog() {
  const nilai = [];
  for await (const baris of createInterface({ input: process.stdin })) {
    const awal = baris.indexOf('{');
    if (awal < 0) continue;
    try {
      const d = JSON.parse(baris.slice(awal));
      if (d.ev === 'respons') nilai.push(d.kalimat1_ms);
    } catch { /* bukan baris JSON gateway */ }
  }
  console.info(JSON.stringify(ringkas(nilai)));
}

const dengar = (server) => new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server.address().port)));

/** Hermes (SSE) dan ElevenLabs TTS tiruan: menunggu sesuai asumsi latensi, lalu menjawab. */
function jalankanTiruan({ hermesMs, ttsMs }) {
  const tiruan = createServer((req, res) => {
    req.resume();
    if (req.url === '/v1/chat/completions') {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        for (const content of JAWABAN_TIRUAN) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
        res.end(`data: ${JSON.stringify({ usage: { total_tokens: 3600 } })}\n\ndata: [DONE]\n\n`);
      }, hermesMs);
    } else if (req.url.startsWith('/v1/text-to-speech/')) {
      setTimeout(() => { res.writeHead(200, { 'content-type': 'audio/mpeg' }); res.end(AUDIO_TIRUAN); }, ttsMs);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  return dengar(tiruan).then((port) => ({ tiruan, alamat: `http://127.0.0.1:${port}` }));
}

/** server.mjs dengan adapter tiruan; baris log 'respons' dikumpulkan ke `respons`. */
async function jalankanGateway(alamatTiruan, respons, lingkungan) {
  const cadang = createServer();
  const port = await dengar(cadang);
  await new Promise((ok) => cadang.close(ok));
  const anak = spawn(process.execPath, ['server.mjs'], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    // stdout dibaca terus; pipa yang tidak dibaca akan penuh dan menahan gateway.
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env, NODE_ENV: 'test', PORT: String(port), SITE_ORIGIN: '',
      HERMES_URL: alamatTiruan, HERMES_API_KEY: 'tiruan', ELEVENLABS_URL: alamatTiruan, ELEVENLABS_API_KEY: 'tiruan',
      SUPABASE_URL: '', SIGAP_KUNCI_INTERNAL: '', CEKBPOM_AKTIF: '0', PENGETAHUAN_VEKTOR: '0',
      // Sama dengan produksi (Dockerfile KORPUS_DIR=/app/knowledge): seluruh knowledge/, bukan hanya regulasi-bpom.
      KORPUS_DIR: fileURLToPath(new URL('../knowledge', import.meta.url)),
      TTS_KARAKTER_HARIAN: KUOTA_TAK_TERBATAS, TTS_KARAKTER_HARIAN_PER_IP: KUOTA_TAK_TERBATAS,
      AI_TOKEN_HARIAN: KUOTA_TAK_TERBATAS, AI_TOKEN_HARIAN_PER_IP: KUOTA_TAK_TERBATAS, AI_TOKEN_PER_PANGGILAN: KUOTA_TAK_TERBATAS,
    },
  });
  createInterface({ input: anak.stdout }).on('line', (baris) => {
    try {
      const d = JSON.parse(baris);
      if (d.ev === 'respons') respons.push(d.kalimat1_ms);
      if (d.ev === 'korpus') lingkungan.korpus = d.potongan;
    } catch { /* bukan baris JSON */ }
  });
  const gateway = `http://127.0.0.1:${port}`;
  for (const batas = Date.now() + BATAS_TUNGGU_GATEWAY_MS; ;) {
    if (anak.exitCode !== null) throw new Error(`gateway berhenti dengan kode ${anak.exitCode}`);
    if (Date.now() > batas) { anak.kill(); throw new Error('gateway tidak menjawab /voice/kesehatan'); }
    if (await fetch(`${gateway}/voice/kesehatan`).then((r) => r.ok, () => false)) return { anak, gateway };
    await jeda(200);
  }
}

/** Satu giliran ketik: t_jeda (transkrip bertanda jeda), t_kalimat1 (baris kalimat pertama), t_suara1 (audio kalimat pertama diterima utuh). */
async function satuGiliran(gateway, kirim, id, teks) {
  const catatan = { jeda: null, kalimat1: null, suara1: null, galat: false, tanpaSuara: false };
  const t0 = performance.now();
  const sejak = () => Math.round(performance.now() - t0);
  // null bila audio gagal diambil; tidak pernah menolak, jadi unduhan yang belum ditunggu tidak menjatuhkan proses.
  const unduh = (suara) => fetch(`${gateway}${suara}`).then((r) => (r.ok ? r.arrayBuffer().then(sejak) : null)).catch(() => null);
  try {
    const r = await kirim('/voice/giliran', { id, teks });
    if (!r.ok) { await r.arrayBuffer(); return { ...catatan, galat: true }; }
    let suara1 = null, sisa = '';
    const audioLain = [];
    for await (const bagian of r.body.pipeThrough(new TextDecoderStream())) {
      sisa += bagian;
      let n;
      while ((n = sisa.indexOf('\n')) >= 0) {
        const d = JSON.parse(sisa.slice(0, n));
        sisa = sisa.slice(n + 1);
        if (d.jenis === 'galat') catatan.galat = true;
        if (d.jenis === 'transkrip' && d.jeda) catatan.jeda = sejak();
        if (d.jenis !== 'kalimat') continue;
        if (catatan.kalimat1 === null) {
          catatan.kalimat1 = sejak();
          catatan.tanpaSuara = !d.suara;
          if (d.suara) suara1 = unduh(d.suara);
        } else if (d.suara) audioLain.push(unduh(d.suara));
      }
    }
    catatan.suara1 = await suara1;
    if ((suara1 && catatan.suara1 === null) || (await Promise.all(audioLain)).includes(null)) catatan.galat = true;
  } catch {
    catatan.galat = true;
  }
  return catatan;
}

/** Satu penelepon: tekan 1, beberapa giliran pertanyaan, lalu Akhiri Panggilan. */
async function satuSesi(gateway, nomor, jumlahGiliran) {
  const id = randomUUID();
  // IP sendiri per sesi, supaya batas per IP gateway (3 giliran serentak, 30 giliran per 5 menit) berlaku per penelepon.
  // Di balik Caddy entri ini diabaikan (ipKlien memakai entri terakhir dari Caddy).
  const kepala = { 'content-type': 'application/json', origin: new URL(gateway).origin, 'x-forwarded-for': `10.0.${nomor >> 8}.${nomor & 255}` };
  const kirim = (path, body) => fetch(`${gateway}${path}`, { method: 'POST', headers: kepala, body: JSON.stringify(body) });
  const menu = await kirim('/voice/giliran', { id, pilih: 1 }).then(async (r) => { await r.arrayBuffer(); return r.ok; }).catch(() => false);
  const hasil = [];
  for (let g = 0; g < jumlahGiliran; g++) {
    if (!menu) { hasil.push({ jeda: null, kalimat1: null, suara1: null, galat: true, tanpaSuara: false }); continue; }
    hasil.push(await satuGiliran(gateway, kirim, id, PERTANYAAN[g % PERTANYAAN.length]));
  }
  await kirim('/voice/akhiri', { id }).then((r) => r.arrayBuffer()).catch(() => {});
  return hasil;
}

async function modeBeban(opsi) {
  const lingkungan = { gateway: opsi.gateway ?? 'lokal, adapter tiruan', hermes_ms: null, tts_ms: null, korpus: null };
  const respons = [];
  let tiruan = null, anak = null, gateway = opsi.gateway;
  try {
    if (gateway) {
      console.error('Mode --gateway memakai Hermes dan ElevenLabs asli, jadi kuota penyedia terpakai. Di balik Caddy, batas per IP '
        + '(3 giliran serentak, 30 giliran per 5 menit) membatasi satu host pada sekitar --serentak 1 sampai 3.');
    } else {
      Object.assign(lingkungan, { hermes_ms: opsi.hermesMs, tts_ms: opsi.ttsMs });
      const t = await jalankanTiruan(opsi);
      tiruan = t.tiruan;
      ({ anak, gateway } = await jalankanGateway(t.alamat, respons, lingkungan));
    }
    const fase = [];
    for (const serentak of new Set([1, opsi.serentak])) {
      const awal = respons.length;
      const semua = (await Promise.all(Array.from({ length: serentak }, (_, i) => satuSesi(gateway, i, opsi.giliran)))).flat();
      // Baris log 'respons' ditulis sebelum res.end(), tetapi bisa tiba lewat pipa sedikit setelah respons HTTP.
      for (const batas = Date.now() + 2000; tiruan && respons.length - awal < semua.filter((c) => !c.galat).length && Date.now() < batas;) await jeda(20);
      const metrik = (k) => ringkas(semua.map((c) => c[k]), opsi.batasMs);
      fase.push({
        serentak, giliran: semua.length, t_jeda: metrik('jeda'), t_kalimat1: metrik('kalimat1'), t_suara1: metrik('suara1'),
        server_kalimat1: tiruan ? ringkas(respons.slice(awal), opsi.batasMs) : null,
        galat: semua.filter((c) => c.galat).length, tanpa_suara: semua.filter((c) => c.tanpaSuara).length,
      });
    }
    console.info(JSON.stringify({ lingkungan, batas_ms: opsi.batasMs, fase }, null, 2));
    const akhir = fase.at(-1);
    if (!akhir.t_suara1.lulus || akhir.galat > 0) process.exitCode = 1;
  } finally {
    anak?.kill();
    tiruan?.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { positionals: [mode], values: v } = parseArgs({
    allowPositionals: true,
    options: {
      serentak: { type: 'string' }, giliran: { type: 'string', default: '3' }, gateway: { type: 'string' },
      'hermes-ms': { type: 'string', default: String(HERMES_MS_BAWAAN) }, 'tts-ms': { type: 'string', default: String(TTS_MS_BAWAAN) },
      'batas-ms': { type: 'string', default: String(BATAS_NFR_1_MS) },
    },
  });
  if (mode === 'log') await modeLog();
  else if (mode === 'beban') {
    await modeBeban({
      // Terhadap gateway asli bawaannya satu sesi, supaya kuota penyedia tidak habis tanpa sengaja.
      serentak: Number(v.serentak ?? (v.gateway ? 1 : SERENTAK_NFR_4)), giliran: Number(v.giliran), gateway: v.gateway?.replace(/\/$/, ''),
      hermesMs: Number(v['hermes-ms']), ttsMs: Number(v['tts-ms']), batasMs: Number(v['batas-ms']),
    });
  } else {
    console.error('Pakai: node voice-gateway/ujiKinerja.mjs beban|log [opsi], lihat komentar di awal berkas.');
    process.exitCode = 2;
  }
}
