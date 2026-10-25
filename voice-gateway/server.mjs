// Boundary UC-01/UC-02 Voice Gateway: mikrofon browser -> ElevenLabs STT -> Hermes Agent -> ElevenLabs TTS.
// Satu giliran = satu permintaan HTTP; audio jawaban di-stream lewat token sekali pakai agar cepat mulai diputar.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import {
  PESAN_BATAS_AI, PESAN_DI_LUAR_TOPIK, PESAN_JEDA, PESAN_LAYANAN_1, PESAN_LAYANAN_2, PESAN_MENU, PESAN_PENUTUP, PESAN_TAWARAN_PENUTUP,
  PANJANG_MAKS_UCAPAN, AnggaranToken, PembatasLaju, PemecahKalimat, RiwayatPanggilan, SusunanJawaban, idPanggilanSah, inginMenutup,
  pesanLayanan, saringUcapan, teksUntukSuara,
} from './percakapan.mjs';
import { Korpus, pesanKutipan } from './pengetahuan.mjs';
import {
  PESAN_BUTUH_PETUGAS, PESAN_MINTA_ULANG_TELEPON, PembatasTiket, PenerbitTiketSupabase, PenerbitTiketTiruan, butuhPetugas, nomorTeleponDariUcapan,
  pesanTiketEskalasi,
} from './eskalasi.mjs';

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
  menu: PESAN_MENU, 'layanan-1': PESAN_LAYANAN_1, 'layanan-2': PESAN_LAYANAN_2, 'di-luar-topik': PESAN_DI_LUAR_TOPIK, penutup: PESAN_PENUTUP,
  'butuh-petugas': PESAN_BUTUH_PETUGAS, 'ulang-telepon': PESAN_MINTA_ULANG_TELEPON, 'tawaran-penutup': PESAN_TAWARAN_PENUTUP, jeda: PESAN_JEDA,
};
// Kutipan RAG yang dikirim ke AI. Lebih sedikit kutipan berarti prompt lebih pendek dan token pertama lebih cepat.
const KUTIPAN_MAKS = 2;
const PESAN_GANGGUAN = 'Layanan suara sedang gangguan. Silakan coba lagi.';
// Tiket eskalasi lewat Edge Function bila Supabase dikonfigurasi, selain itu tiket tiruan di memori (#30).
const SUPABASE_URL = env('SUPABASE_URL', '');
const SIGAP_KUNCI_INTERNAL = env('SIGAP_KUNCI_INTERNAL', '');
const penerbitTiket = SUPABASE_URL && SIGAP_KUNCI_INTERNAL ? new PenerbitTiketSupabase(SUPABASE_URL, SIGAP_KUNCI_INTERNAL) : new PenerbitTiketTiruan();
const pembatasTiket = new PembatasTiket({
  perPanggilan: Number(env('TIKET_PER_PANGGILAN', '2')),
  perIpHarian: Number(env('TIKET_HARIAN_PER_IP', '5')),
  perNomorHarian: Number(env('TIKET_HARIAN_PER_NOMOR', '3')),
});

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

// Render TTS dimulai saat token terbit, jadi audio sudah mengalir ketika browser memintanya. Kuota dipotong di sini
// karena di sinilah biaya terjadi; bila kuota habis, jawaban tetap tampil sebagai teks tanpa suara.
// Render yang tidak pernah diambil berhenti sendiri oleh BATAS_WAKTU_TTS_MS.
function terbitkanTokenSuara(teks, ip) {
  const sekarang = Date.now();
  for (const [t, v] of tokenSuara) if (v.kedaluwarsa < sekarang) tokenSuara.delete(t);
  try {
    catatTts(teks, ip);
  } catch (e) {
    if (e instanceof ErrorGateway) return null;
    throw e;
  }
  const render = ttsElevenLabs(teks);
  render.catch(() => {});
  const token = randomUUID();
  tokenSuara.set(token, { render, kedaluwarsa: sekarang + TOKEN_SUARA_MS });
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

// Jawaban dialirkan (stream) per potongan agar kalimat pertama bisa diubah menjadi suara sebelum jawaban selesai.
// Hermes mengabaikan max_tokens, jadi panjang jawaban dijaga lewat prompt dan SusunanJawaban, pemakaian lewat AnggaranToken.
async function* aliranHermes(id, kutipan, hasil) {
  const pesan = riwayat.untukModel(id, kutipan);
  const r = await fetch(`${HERMES_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${HERMES_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: HERMES_MODEL, messages: pesan, stream: true }),
    signal: AbortSignal.timeout(BATAS_WAKTU_HERMES_MS),
  });
  if (!r.ok || !r.body) throw new Error(`hermes ${r.status}`);
  const dekoder = new TextDecoder();
  let sisa = '', keluaran = '';
  for await (const bagian of r.body) {
    sisa += dekoder.decode(bagian, { stream: true });
    let n;
    while ((n = sisa.indexOf('\n')) >= 0) {
      const baris = sisa.slice(0, n).trim();
      sisa = sisa.slice(n + 1);
      if (!baris.startsWith('data:')) continue;
      let d;
      try { d = JSON.parse(baris.slice(5)); } catch { continue; }
      if (d?.usage?.total_tokens) hasil.token = Number(d.usage.total_tokens);
      // Hermes juga mengirim event miliknya sendiri tanpa `choices`; event itu dilewati.
      const potongan = d?.choices?.[0]?.delta?.content;
      if (potongan) { keluaran += potongan; yield potongan; }
    }
  }
  if (!hasil.token) hasil.token = Math.ceil((JSON.stringify(pesan).length + keluaran.length) / 3);
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
    riwayat.pilihLayanan(body.id, Number(body.pilih));
    riwayat.selesaiEskalasi(body.id);
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

    // Jawaban dikirim sebagai NDJSON: transkrip lebih dulu (dengan tanda putar kalimat jeda bila AI dipanggil),
    // lalu tiap kalimat beserta suaranya begitu siap, terakhir sumber dan status panggilan.
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' });
    const tulis = (baris) => res.write(`${JSON.stringify(baris)}\n`);
    const ucapkan = (teks, suara) => tulis({ jenis: 'kalimat', teks, suara });
    try {
      if (!transkrip) {
        tulis({ jenis: 'transkrip', transkrip: '' });
        tulis({ jenis: 'selesai' });
        return;
      }

      // T-F1.4-03 (REQ-1.7, NFR-6): pertanyaan medis tidak dijawab AI. Agen meminta nomor telepon, memintanya ulang
      // bila tidak valid, lalu menerbitkan tiket ESK. Semua giliran ini tanpa AI.
      const pertanyaanEskalasi = riwayat.eskalasi(id);
      if (pertanyaanEskalasi !== null || (riwayat.layanan(id) !== 2 && butuhPetugas(transkrip))) {
        tulis({ jenis: 'transkrip', transkrip });
        let jawaban, suara, tiket = null;
        if (pertanyaanEskalasi === null) {
          riwayat.mulaiEskalasi(id, transkrip);
          riwayat.tambah(id, 'user', transkrip);
          jawaban = PESAN_BUTUH_PETUGAS;
          suara = '/voice/statis/butuh-petugas';
        } else {
          const nomorTelepon = nomorTeleponDariUcapan(transkrip);
          // Nomor telepon tidak masuk riwayat yang dikirim ke AI.
          riwayat.tambah(id, 'user', nomorTelepon ? '(menyebutkan nomor telepon)' : transkrip);
          if (nomorTelepon) {
            // Status eskalasi dan kuota diambil sebelum await, jadi giliran serentak pada panggilan yang sama
            // tidak bisa menerbitkan tiket kedua. Bila penerbitan gagal, keduanya dikembalikan.
            riwayat.selesaiEskalasi(id);
            const batasTiket = pembatasTiket.cadangkan(id, ip, nomorTelepon);
            if (batasTiket) {
              console.info(JSON.stringify({ ev: 'eskalasi', tahap: 'ditolak', batas: batasTiket }));
              throw new ErrorGateway(429, 'Batas penerbitan tiket hari ini sudah tercapai. Silakan coba lagi besok.');
            }
            try {
              tiket = await penerbitTiket.terbitkan({ percakapanId: id, nomorTelepon, pertanyaan: pertanyaanEskalasi });
            } catch (e) {
              pembatasTiket.batalkan(id, ip, nomorTelepon);
              riwayat.mulaiEskalasi(id, pertanyaanEskalasi);
              throw e;
            }
            jawaban = pesanTiketEskalasi(tiket);
            suara = terbitkanTokenSuara(jawaban, ip);
          } else {
            jawaban = PESAN_MINTA_ULANG_TELEPON;
            suara = '/voice/statis/ulang-telepon';
          }
        }
        riwayat.tambah(id, 'assistant', jawaban);
        console.info(JSON.stringify({ ev: 'eskalasi', tahap: tiket ? 'tiket' : pertanyaanEskalasi === null ? 'minta_telepon' : 'ulang_telepon', stt_ms: tStt }));
        ucapkan(jawaban, suara);
        tulis({ jenis: 'selesai', tiket });
        return;
      }

      // Penelepon menolak tawaran bantuan lagi: salam penutup tanpa memanggil AI, lalu web mengakhiri panggilan.
      const menutup = inginMenutup(transkrip, riwayat.jawabanTerakhir(id));
      // REQ-1.8: ucapan yang tersaring tidak dikirim ke AI dan tidak masuk riwayat, agar tidak memengaruhi giliran berikutnya.
      const saring = menutup ? null : saringUcapan(transkrip, riwayat.diLuarTopik(id));
      if (menutup || saring) {
        tulis({ jenis: 'transkrip', transkrip });
        if (menutup) {
          riwayat.tambah(id, 'user', transkrip);
          riwayat.tambah(id, 'assistant', PESAN_PENUTUP);
          ucapkan(PESAN_PENUTUP, '/voice/statis/penutup');
        } else {
          riwayat.catatDiLuarTopik(id);
          ucapkan(PESAN_DI_LUAR_TOPIK, '/voice/statis/di-luar-topik');
        }
        console.info(JSON.stringify({ ev: 'giliran', stt_ms: tStt, total_ms: Date.now() - mulai, saring, menutup, token: 0 }));
        tulis({ jenis: 'selesai', akhiri: menutup });
        return;
      }

      riwayat.tambah(id, 'user', transkrip);
      tulis({ jenis: 'transkrip', transkrip, jeda: true });
      const kutipan = korpus ? korpus.cari(transkrip, KUTIPAN_MAKS) : [];
      const susunan = new SusunanJawaban(PESAN_BUTUH_PETUGAS);
      const pemecah = new PemecahKalimat();
      const hasil = { token: 0 };
      let tKalimat1 = 0;
      const proses = (kalimat) => {
        for (const k of kalimat) {
          const ucap = susunan.tambah(k);
          if (!ucap) continue;
          if (!tKalimat1) tKalimat1 = Date.now() - mulai;
          ucapkan(ucap, terbitkanTokenSuara(ucap, ip));
        }
      };
      try {
        for await (const potongan of aliranHermes(id, pesanKutipan(kutipan), hasil)) proses(pemecah.tambah(potongan));
        proses(pemecah.akhiri());
      } finally {
        anggaranAi.catat(ip, id, hasil.token - cadangan);
        cadangan = 0;
      }

      let jawaban = susunan.teks;
      const diLuarTopik = susunan.khusus === 'di_luar_topik';
      if (diLuarTopik) {
        jawaban = PESAN_DI_LUAR_TOPIK;
        riwayat.catatDiLuarTopik(id);
        ucapkan(jawaban, '/voice/statis/di-luar-topik');
      } else if (susunan.khusus === 'butuh_petugas') {
        // Pertanyaan medis yang lolos dari pola dikenali dari jawaban AI: giliran berikutnya meminta nomor telepon.
        jawaban = PESAN_BUTUH_PETUGAS;
        riwayat.mulaiEskalasi(id, transkrip);
        ucapkan(jawaban, '/voice/statis/butuh-petugas');
      } else if (!susunan.isi.length) {
        jawaban = 'Maaf, saya belum bisa menjawab. Silakan ulangi pertanyaan Anda.';
        ucapkan(jawaban, terbitkanTokenSuara(jawaban, ip));
      } else if (susunan.tawaran) {
        ucapkan(PESAN_TAWARAN_PENUTUP, '/voice/statis/tawaran-penutup');
      }
      riwayat.tambah(id, 'assistant', jawaban);
      console.info(JSON.stringify({
        ev: 'giliran', stt_ms: tStt, kalimat1_ms: tKalimat1, total_ms: Date.now() - mulai, ucapan_kar: transkrip.length,
        jawaban_kar: jawaban.length, kalimat: susunan.isi.length, kutipan: kutipan.length, di_luar_topik: diLuarTopik,
        token: hasil.token, token_hari_ini: anggaranAi.total,
      }));
      const sumber = susunan.khusus ? [] : kutipan.map((k) => ({ peraturan: k.label, judul: k.judul, url: k.sumber }));
      tulis({ jenis: 'selesai', sumber });
    } catch (e) {
      if (!(e instanceof ErrorGateway)) console.error(JSON.stringify({ ev: 'galat', path: '/voice/giliran', jenis: e instanceof Error ? e.message : 'unknown' }));
      tulis({ jenis: 'galat', message: e instanceof ErrorGateway ? e.message : PESAN_GANGGUAN });
    } finally {
      res.end();
    }
  } finally {
    // AI tidak jadi dipanggil (ucapan kosong, tersaring, atau galat): kembalikan cadangan.
    if (cadangan) anggaranAi.catat(ip, id, -cadangan);
    const sisa = (giliranAktif.get(ip) ?? 1) - 1;
    if (sisa > 0) giliranAktif.set(ip, sisa); else giliranAktif.delete(ip);
  }
}

async function suara(res, token) {
  const entri = tokenSuara.get(token);
  if (!entri || entri.kedaluwarsa < Date.now()) throw new ErrorGateway(404, 'Suara tidak ditemukan.');
  tokenSuara.delete(token);
  const aliran = await entri.render;
  res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' });
  // pipeline menutup aliran TTS bila browser memutus koneksi (misalnya panggilan diakhiri saat audio diputar).
  // Dengan pipe() aliran itu dibiarkan menggantung lalu galat batas waktunya tidak tertangani dan proses gateway berhenti.
  await pipeline(Readable.fromWeb(aliran), res).catch(() => {});
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
    return kirim(res, 502, 'error', PESAN_GANGGUAN);
  }
});

server.requestTimeout = 90_000;
server.listen(PORT, () => {
  console.info(JSON.stringify({ ev: 'siap', port: PORT, siap: Boolean(ELEVENLABS_KEY && HERMES_KEY) }));
  // Render pesan tetap sekali saat mulai, supaya tidak ada render bersamaan dari permintaan pengguna.
  if (ELEVENLABS_KEY) for (const nama of Object.keys(SUARA_STATIS)) statis({ writeHead() {}, end() {} }, nama).catch(() => {});
});
