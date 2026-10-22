// Boundary UC-01/UC-02 Voice Gateway: mikrofon browser -> ElevenLabs STT -> Hermes Agent -> ElevenLabs TTS.
// Satu giliran = satu permintaan HTTP; audio jawaban di-stream lewat token sekali pakai agar cepat mulai diputar.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  PESAN_BATAS_AI, PESAN_DI_LUAR_TOPIK, PESAN_LAYANAN_1, PESAN_LAYANAN_2, PESAN_MENU, PANJANG_MAKS_UCAPAN, AnggaranToken, PembatasLaju,
  RiwayatPanggilan, idPanggilanSah, jawabanDiLuarTopik, pesanLayanan, rapikanJawaban, saringUcapan, teksUntukSuara,
} from './percakapan.mjs';
import { Korpus, pesanKutipan } from './pengetahuan.mjs';

const env = (k, d) => process.env[k] || d;
const PORT = Number(env('PORT', '8090'));
const ASAL_SITUS = env('SITE_ORIGIN', '');
const ELEVENLABS_KEY = env('ELEVENLABS_API_KEY', '');
// Suara "Zaak" dari library ElevenLabs: penutur asli, jelas, cocok untuk IVR.
const ELEVENLABS_SUARA = env('ELEVENLABS_VOICE_ID', 'HnnPtoATgzx4ubChwm24');
// v3 conversational dipilih karena intonasinya paling natural. Model ini mengabaikan `speed`, jadi tempo CS
// diatur di pemutar web (KECEPATAN_PUTAR di PanelSuara.astro). Render pertama suatu suara bisa belasan detik;
// render pesan tetap saat mulai sekaligus memanaskannya.
const ELEVENLABS_MODEL_TTS = env('ELEVENLABS_TTS_MODEL', 'eleven_v3_conversational');
// Stabilitas v3 hanya menerima 0 (kreatif), 0.5 (natural), atau 1 (robust).
const ELEVENLABS_STABILITAS = Number(env('ELEVENLABS_TTS_STABILITY', '0.5'));
const ELEVENLABS_MODEL_STT = env('ELEVENLABS_STT_MODEL', 'scribe_v2');
const HERMES_URL = env('HERMES_URL', 'http://host.docker.internal:8642');
const HERMES_KEY = env('HERMES_API_KEY', '');
const HERMES_MODEL = env('HERMES_MODEL', 'sigap-hermes');
// Kuota karakter TTS per hari (total dan per IP) agar kuota paket ElevenLabs tidak habis oleh satu pengguna.
const KARAKTER_TTS_HARIAN = Number(env('TTS_KARAKTER_HARIAN', '6000'));
const KARAKTER_TTS_HARIAN_PER_IP = Number(env('TTS_KARAKTER_HARIAN_PER_IP', '1500'));
// Anggaran token AI dari `usage` Hermes. Satu giliran sekitar 3.600 token: prompt sistem Hermes plus kutipan peraturan.
const TOKEN_AI_HARIAN = Number(env('AI_TOKEN_HARIAN', '500000'));
const TOKEN_AI_HARIAN_PER_IP = Number(env('AI_TOKEN_HARIAN_PER_IP', '100000'));
const TOKEN_AI_PER_PANGGILAN = Number(env('AI_TOKEN_PER_PANGGILAN', '40000'));
// Dicadangkan per giliran sebelum AI dipanggil, lalu dikoreksi dengan `usage` nyata.
const PERKIRAAN_TOKEN_GILIRAN = 4000;
// Satu penelepon hanya punya satu giliran berjalan; sisanya untuk beberapa penelepon di balik IP yang sama.
const GILIRAN_SERENTAK_PER_IP = Number(env('AI_GILIRAN_SERENTAK_PER_IP', '3'));
// Pesan tetap dirender sekali lalu disimpan di memori, tanpa memakai kuota harian.
const SUARA_STATIS = {
  menu: PESAN_MENU, 'layanan-1': PESAN_LAYANAN_1, 'layanan-2': PESAN_LAYANAN_2, 'di-luar-topik': PESAN_DI_LUAR_TOPIK,
};

const AUDIO_MAKS_BYTE = 4 * 1024 * 1024;
const JSON_MAKS_BYTE = 16 * 1024;
const TOKEN_SUARA_MS = 2 * 60 * 1000;
const BATAS_WAKTU_STT_MS = 20_000;
const BATAS_WAKTU_HERMES_MS = 60_000;
const BATAS_WAKTU_TTS_MS = 30_000;

const DIREKTORI_KORPUS = env('KORPUS_DIR', fileURLToPath(new URL('../knowledge/regulasi-bpom', import.meta.url)));

const riwayat = new RiwayatPanggilan();
let korpus = null;
try {
  const mulai = Date.now();
  korpus = Korpus.muat(DIREKTORI_KORPUS);
  console.info(JSON.stringify({ ev: 'korpus', potongan: korpus.potongan.length, ms: Date.now() - mulai }));
} catch (e) {
  console.error(JSON.stringify({ ev: 'korpus_gagal', jenis: e instanceof Error ? e.code ?? e.message : 'unknown' }));
}
const lajuGiliran = new PembatasLaju(30, 5 * 60 * 1000);
const anggaranAi = new AnggaranToken({ harian: TOKEN_AI_HARIAN, harianPerIp: TOKEN_AI_HARIAN_PER_IP, perPanggilan: TOKEN_AI_PER_PANGGILAN });
const giliranAktif = new Map();
const tokenSuara = new Map();
let pemakaianTts = { hari: '', karakter: 0, perIp: new Map() };
const suaraStatis = new Map();

const kirim = (res, kode, status, message, data = null) => {
  res.writeHead(kode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ status, message, data }));
};

class ErrorGateway extends Error {
  constructor(kode, pesan) { super(pesan); this.kode = kode; }
}

function bacaBody(req, maks) {
  return new Promise((resolve, reject) => {
    const bagian = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > maks) { reject(new ErrorGateway(413, 'Rekaman terlalu panjang.')); req.destroy(); return; }
      bagian.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(bagian)));
    req.on('error', reject);
  });
}

// Gateway hanya bisa dicapai lewat Caddy, yang menambahkan alamat klien sebagai entri TERAKHIR
// X-Forwarded-For. Entri sebelumnya bisa dipalsukan klien, jadi tidak dipakai.
const ipKlien = (req) => {
  const xff = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.at(-1) ?? req.socket.remoteAddress ?? '';
};

function catatTts(teks, ip) {
  const hari = new Date().toISOString().slice(0, 10);
  if (pemakaianTts.hari !== hari) pemakaianTts = { hari, karakter: 0, perIp: new Map() };
  const milikIp = pemakaianTts.perIp.get(ip) ?? 0;
  if (pemakaianTts.karakter + teks.length > KARAKTER_TTS_HARIAN || milikIp + teks.length > KARAKTER_TTS_HARIAN_PER_IP) {
    throw new ErrorGateway(429, 'Kuota suara hari ini sudah habis. Coba lagi besok.');
  }
  pemakaianTts.karakter += teks.length;
  pemakaianTts.perIp.set(ip, milikIp + teks.length);
}

function terbitkanTokenSuara(teks, ip) {
  const sekarang = Date.now();
  for (const [t, v] of tokenSuara) if (v.kedaluwarsa < sekarang) tokenSuara.delete(t);
  const token = randomUUID();
  tokenSuara.set(token, { teks, ip, kedaluwarsa: sekarang + TOKEN_SUARA_MS });
  return `/voice/suara/${token}`;
}

async function sttElevenLabs(audio, tipe) {
  const form = new FormData();
  form.append('model_id', ELEVENLABS_MODEL_STT);
  form.append('language_code', 'ind');
  form.append('tag_audio_events', 'false');
  form.append('file', new Blob([audio], { type: tipe }), 'ucapan');
  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST', headers: { 'xi-api-key': ELEVENLABS_KEY }, body: form, signal: AbortSignal.timeout(BATAS_WAKTU_STT_MS),
  });
  if (!r.ok) throw new Error(`stt ${r.status}`);
  const d = await r.json();
  return String(d.text ?? '').replace(/\s+/g, ' ').trim().slice(0, PANJANG_MAKS_UCAPAN);
}

// Hermes mengabaikan max_tokens, jadi panjang jawaban dijaga lewat prompt dan rapikanJawaban, pemakaian lewat AnggaranToken.
async function tanyaHermes(id, kutipan) {
  const pesan = riwayat.untukModel(id, kutipan);
  const r = await fetch(`${HERMES_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${HERMES_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: HERMES_MODEL, messages: pesan }),
    signal: AbortSignal.timeout(BATAS_WAKTU_HERMES_MS),
  });
  if (!r.ok) throw new Error(`hermes ${r.status}`);
  const d = await r.json();
  const token = Number(d.usage?.total_tokens) || Math.ceil(JSON.stringify(pesan).length / 3);
  return { jawaban: rapikanJawaban(d.choices?.[0]?.message?.content), token };
}

async function ttsElevenLabs(teks) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_SUARA}/stream?output_format=mp3_44100_64`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: teksUntukSuara(teks), model_id: ELEVENLABS_MODEL_TTS, language_code: 'id', voice_settings: { stability: ELEVENLABS_STABILITAS },
    }),
    signal: AbortSignal.timeout(BATAS_WAKTU_TTS_MS),
  });
  if (!r.ok || !r.body) throw new Error(`tts ${r.status}`);
  return r.body;
}

/** POST /voice/giliran: JSON {id, pilih} untuk tombol menu, atau audio mentah (?id=) untuk ucapan. */
async function giliran(req, res, url) {
  if (!lajuGiliran.izinkan(ipKlien(req))) throw new ErrorGateway(429, 'Terlalu banyak permintaan. Coba lagi sebentar lagi.');
  const tipe = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();

  if (tipe === 'application/json') {
    let body;
    try { body = JSON.parse((await bacaBody(req, JSON_MAKS_BYTE)).toString('utf8')); } catch { throw new ErrorGateway(400, 'Permintaan tidak valid.'); }
    if (!idPanggilanSah(body?.id)) throw new ErrorGateway(400, 'Permintaan tidak valid.');
    const jawaban = pesanLayanan(Number(body.pilih));
    if (!jawaban) throw new ErrorGateway(422, 'Pilihan layanan tidak dikenal.');
    riwayat.tambah(body.id, 'user', `Saya memilih layanan ${body.pilih}.`);
    riwayat.tambah(body.id, 'assistant', jawaban);
    return kirim(res, 200, 'success', 'OK', { transkrip: null, jawaban, suara: `/voice/statis/layanan-${Number(body.pilih)}` });
  }

  if (!tipe.startsWith('audio/') && !tipe.startsWith('video/')) throw new ErrorGateway(415, 'Format rekaman tidak didukung.');
  const id = url.searchParams.get('id');
  if (!idPanggilanSah(id)) throw new ErrorGateway(400, 'Permintaan tidak valid.');
  const ip = ipKlien(req);
  // Sebelum STT: batasi giliran serentak dan cadangkan token, supaya permintaan paralel ikut terhitung
  // dan panggilan yang anggarannya habis tidak ikut memakai kuota ElevenLabs.
  if ((giliranAktif.get(ip) ?? 0) >= GILIRAN_SERENTAK_PER_IP) throw new ErrorGateway(429, 'Terlalu banyak permintaan. Coba lagi sebentar lagi.');
  const batasAi = anggaranAi.cadangkan(ip, id, PERKIRAAN_TOKEN_GILIRAN);
  if (batasAi) throw new ErrorGateway(429, PESAN_BATAS_AI[batasAi]);
  giliranAktif.set(ip, (giliranAktif.get(ip) ?? 0) + 1);
  let cadangan = PERKIRAAN_TOKEN_GILIRAN;
  try {
    const audio = await bacaBody(req, AUDIO_MAKS_BYTE);
    if (audio.length < 1000) throw new ErrorGateway(422, 'Suara tidak terdengar. Silakan ulangi.');

    const mulai = Date.now();
    const transkrip = await sttElevenLabs(audio, tipe);
    const tStt = Date.now() - mulai;
    if (!transkrip) return kirim(res, 200, 'success', 'OK', { transkrip: '', jawaban: null, suara: null });

    // REQ-1.8: ucapan yang tersaring tidak dikirim ke AI dan tidak masuk riwayat, agar tidak memengaruhi giliran berikutnya.
    const saring = saringUcapan(transkrip, riwayat.diLuarTopik(id));
    let jawaban = PESAN_DI_LUAR_TOPIK, kutipan = [], token = 0;
    if (!saring) {
      riwayat.tambah(id, 'user', transkrip);
      kutipan = korpus ? korpus.cari(transkrip) : [];
      const hasil = await tanyaHermes(id, pesanKutipan(kutipan));
      token = hasil.token;
      anggaranAi.catat(ip, id, token - cadangan);
      cadangan = 0;
      jawaban = hasil.jawaban || 'Maaf, saya belum bisa menjawab. Silakan ulangi pertanyaan Anda.';
    }
    const diLuarTopik = Boolean(saring) || jawabanDiLuarTopik(jawaban);
    if (diLuarTopik) {
      jawaban = PESAN_DI_LUAR_TOPIK;
      kutipan = [];
      riwayat.catatDiLuarTopik(id);
    }
    if (!saring) riwayat.tambah(id, 'assistant', jawaban);
    const tTotal = Date.now() - mulai;
    console.info(JSON.stringify({
      ev: 'giliran', stt_ms: tStt, total_ms: tTotal, ucapan_kar: transkrip.length, jawaban_kar: jawaban.length, kutipan: kutipan.length,
      saring, di_luar_topik: diLuarTopik, token, token_hari_ini: anggaranAi.total - cadangan,
    }));
    const sumber = kutipan.map((k) => ({ peraturan: k.label, judul: k.judul, url: k.sumber }));
    const suara = diLuarTopik ? '/voice/statis/di-luar-topik' : terbitkanTokenSuara(jawaban, ip);
    return kirim(res, 200, 'success', 'OK', { transkrip, jawaban, sumber, suara });
  } finally {
    // AI tidak jadi dipanggil (ucapan kosong, tersaring, atau galat): kembalikan cadangan.
    if (cadangan) anggaranAi.catat(ip, id, -cadangan);
    const sisa = (giliranAktif.get(ip) ?? 1) - 1;
    if (sisa > 0) giliranAktif.set(ip, sisa); else giliranAktif.delete(ip);
  }
}

// Kuota dipotong saat audio benar-benar dibuat, bukan saat token diterbitkan.
async function suara(res, token) {
  const entri = tokenSuara.get(token);
  if (!entri || entri.kedaluwarsa < Date.now()) throw new ErrorGateway(404, 'Suara tidak ditemukan.');
  tokenSuara.delete(token);
  catatTts(entri.teks, entri.ip);
  const aliran = await ttsElevenLabs(entri.teks);
  res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' });
  Readable.fromWeb(aliran).pipe(res);
}

// Promise disimpan agar permintaan bersamaan berbagi satu render; dibuang hanya bila render gagal.
async function statis(res, nama) {
  const teks = Object.hasOwn(SUARA_STATIS, nama) ? SUARA_STATIS[nama] : null;
  if (!teks) throw new ErrorGateway(404, 'Suara tidak ditemukan.');
  if (!suaraStatis.has(nama)) {
    const render = ttsElevenLabs(teks).then(async (aliran) => Buffer.from(await new Response(aliran).arrayBuffer()));
    render.catch(() => suaraStatis.delete(nama));
    suaraStatis.set(nama, render);
  }
  const audio = await suaraStatis.get(nama);
  res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=3600' });
  res.end(audio);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://gateway');
  const path = url.pathname;
  try {
    if (req.method === 'GET' && path === '/voice/kesehatan') {
      return kirim(res, 200, 'success', 'OK', { siap: Boolean(ELEVENLABS_KEY && HERMES_KEY), korpus: korpus?.potongan.length ?? 0 });
    }
    if (req.method === 'POST' && ASAL_SITUS && req.headers.origin !== ASAL_SITUS) throw new ErrorGateway(403, 'Akses ditolak.');
    if (req.method === 'GET' && path.startsWith('/voice/statis/')) return await statis(res, path.slice('/voice/statis/'.length));
    if (req.method === 'GET' && path.startsWith('/voice/suara/')) return await suara(res, path.slice('/voice/suara/'.length));
    if (req.method === 'POST' && path === '/voice/giliran') return await giliran(req, res, url);
    if (req.method === 'POST' && path === '/voice/akhiri') {
      const body = JSON.parse((await bacaBody(req, JSON_MAKS_BYTE)).toString('utf8') || '{}');
      if (idPanggilanSah(body.id)) riwayat.hapus(body.id);
      return kirim(res, 200, 'success', 'OK');
    }
    return kirim(res, 404, 'error', 'Tidak ditemukan.');
  } catch (e) {
    if (res.headersSent) { res.destroy(); return; }
    if (e instanceof ErrorGateway) return kirim(res, e.kode, 'error', e.message);
    // PROJECT_RULES 5.10: log hanya jenis galat, tanpa transkrip atau kunci.
    console.error(JSON.stringify({ ev: 'galat', path, jenis: e instanceof Error ? e.message : 'unknown' }));
    return kirim(res, 502, 'error', 'Layanan suara sedang gangguan. Silakan coba lagi.');
  }
});

server.requestTimeout = 90_000;
server.listen(PORT, () => {
  console.info(JSON.stringify({ ev: 'siap', port: PORT, siap: Boolean(ELEVENLABS_KEY && HERMES_KEY) }));
  // Render pesan tetap sekali saat mulai, supaya tidak ada render bersamaan dari permintaan pengguna.
  if (ELEVENLABS_KEY) for (const nama of Object.keys(SUARA_STATIS)) statis({ writeHead() {}, end() {} }, nama).catch(() => {});
});
