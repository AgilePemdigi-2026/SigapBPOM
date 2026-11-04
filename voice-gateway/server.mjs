// Boundary UC-01/UC-02 Voice Gateway: mikrofon browser -> ElevenLabs STT -> Hermes Agent -> ElevenLabs TTS.
// Satu giliran = satu permintaan HTTP; audio jawaban di-stream lewat token sekali pakai agar cepat mulai diputar.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  PESAN_BATAS_AI, PESAN_DI_LUAR_TOPIK, PESAN_JEDA, PESAN_LAYANAN_1, PESAN_LAYANAN_2, PESAN_MENU, PESAN_PENUTUP, PESAN_TAWARAN_PENUTUP,
  PANJANG_MAKS_UCAPAN, AnggaranToken, PembatasLaju, RiwayatPanggilan, SesiPenuh, SusunanJawaban, alirkanJawaban, idPanggilanSah, inginMenutup,
  menuDariUcapan, pesanLayanan, pilihMenu, saringUcapan, teksUntukSuara, tokenTerpakai, uraiGiliranJson,
} from './percakapan.mjs';
import { KatalogMateriSupabase, Korpus } from './pengetahuan.mjs';
import { CekBpom, labelKueri, tabelCek } from './cekbpom.mjs';
import { NAMA_TOOL as TOOL_CEK_REGISTRASI, PESAN_NAMA_TIDAK_JELAS, PESAN_TIDAK_DITEMUKAN, cekRegistrasiBpom } from './alatCekRegistrasi.mjs';
import {
  NAMA_TOOL as TOOL_PENGETAHUAN, PencariPengetahuanSupabase, cariBasisPengetahuan, kalimatSumber, pesanBasisPengetahuan, sumberUntukPanel,
} from './alatPengetahuan.mjs';
import {
  BatasTiketTercapai, PercakapanDitolak, PESAN_MINTA_KRONOLOGI, PESAN_MINTA_NAMA_PELAPOR, PESAN_MINTA_NAMA_PRODUK, PengaduanController, prosesGiliranPengaduan,
} from './pengaduan.mjs';
import { GerbangPengaduanSupabase, GerbangPengaduanTiruan, PengirimSmsTiruan } from './layananPengaduan.mjs';
import {
  PESAN_BUTUH_PETUGAS, PESAN_MINTA_ULANG_TELEPON, PembatasTiket, PenerbitTiketSupabase, PenerbitTiketTiruan, butuhPetugas, nomorTeleponDariUcapan,
  pesanTiketEskalasi,
} from './eskalasi.mjs';
import { PelaporPanggilanSupabase, PelaporPanggilanTiruan, PemantauPanggilan, TAHAP } from './panggilanAktif.mjs';
import { PencatatTranskrip, PengirimTranskripSupabase, PengirimTranskripTiruan } from './transkrip.mjs';
import { kirimAudio } from './audio.mjs';
import { alamatSttRealtime, buatTokenSttRealtime } from './sttRealtime.mjs';
import { KondisiLayanan } from './kesehatan.mjs';

const env = (k, d) => process.env[k] || d;
const PORT = Number(env('PORT', '8090'));
const ASAL_SITUS = env('SITE_ORIGIN', '');
const ELEVENLABS_KEY = env('ELEVENLABS_API_KEY', '');
// Hanya diganti oleh uji beban (ujiKinerja.mjs) agar STT dan TTS mengarah ke ElevenLabs tiruan.
const ELEVENLABS_URL = env('ELEVENLABS_URL', 'https://api.elevenlabs.io');
// Transkrip live lewat STT realtime ElevenLabs (sttRealtime.mjs). STT_REALTIME=0 mengembalikan panel ke rekam lalu unggah.
const STT_REALTIME = env('STT_REALTIME', '1') !== '0';
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
  'minta-nama-produk': PESAN_MINTA_NAMA_PRODUK, 'minta-kronologi': PESAN_MINTA_KRONOLOGI, 'minta-nama': PESAN_MINTA_NAMA_PELAPOR,
  'tidak-ditemukan': PESAN_TIDAK_DITEMUKAN, 'nama-tidak-jelas': PESAN_NAMA_TIDAK_JELAS,
};
// Kutipan RAG yang dikirim ke AI. Lebih sedikit kutipan berarti prompt lebih pendek dan token pertama lebih cepat.
const KUTIPAN_MAKS = 2;
const PESAN_GANGGUAN = 'Layanan suara sedang gangguan. Silakan coba lagi.';
// Tiket, pengaduan, transkrip, dan panggilan aktif lewat Edge Function. Tiruan di memori hanya untuk pengembangan lokal;
// di produksi gateway berhenti saat start agar penelepon tidak menerima nomor tiket tiruan.
const SUPABASE_URL = env('SUPABASE_URL', '');
const SIGAP_KUNCI_INTERNAL = env('SIGAP_KUNCI_INTERNAL', '');
if (env('NODE_ENV', '') === 'production' && !(SUPABASE_URL && SIGAP_KUNCI_INTERNAL)) {
  console.error(JSON.stringify({ ev: 'env_supabase_kurang' }));
  process.exit(1);
}
const penerbitTiket = SUPABASE_URL && SIGAP_KUNCI_INTERNAL ? new PenerbitTiketSupabase(SUPABASE_URL, SIGAP_KUNCI_INTERNAL) : new PenerbitTiketTiruan();
// REQ-1.3: data registrasi produk langsung dari antarmuka publik cekbpom; aktif hanya bila CEKBPOM_AKTIF=1 (PROJECT_RULES 4.3).
const cekBpom = env('CEKBPOM_AKTIF', '0') === '1' ? new CekBpom({ baseUrl: env('CEKBPOM_BASE_URL', 'https://cekbpom.pom.go.id') }) : null;
// T-F5.4-01: hasil panggilan Hermes, STT, TTS, dan cekbpom terakhir untuk halaman Pantau AI Agent; null sampai ada panggilan.
const kondisi = new KondisiLayanan();
// Tool cari_basis_pengetahuan (T-F1.3-03): pencarian vektor lewat Edge Function, hanya bila PENGETAHUAN_VEKTOR=1
// (embedding produksi belum ada); selain itu dipakai korpus lokal.
const pencariPengetahuan = SUPABASE_URL && SIGAP_KUNCI_INTERNAL && env('PENGETAHUAN_VEKTOR', '0') === '1' ? new PencariPengetahuanSupabase(SUPABASE_URL, SIGAP_KUNCI_INTERNAL) : null;
// Katalog materi dari Supabase (halaman Basis Pengetahuan dan Graf Pengetahuan): status aktif dan materi baru
// ikut menentukan kutipan CS AI. Tanpa kunci internal, semua berkas korpus dipakai seperti sebelumnya.
const SINKRON_KATALOG_MS = Number(env('KATALOG_SINKRON_MS', String(5 * 60 * 1000)));
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
// Tiket pengaduan lewat Edge Function bila Supabase dikonfigurasi, selain itu tiruan di memori. SMS selalu lewat adapter tiruan (REQ-2.4).
const pengaduan = new PengaduanController({
  gerbang: SUPABASE_URL && SIGAP_KUNCI_INTERNAL ? new GerbangPengaduanSupabase(SUPABASE_URL, SIGAP_KUNCI_INTERNAL) : new GerbangPengaduanTiruan(),
  pengirimSms: new PengirimSmsTiruan(),
  pembatas: pembatasTiket,
});
// NFR-20: transkrip dan log tool gateway tersimpan di register layanan lewat Edge Function, selain itu tiruan di memori.
const pencatat = new PencatatTranskrip({
  pengirim: SUPABASE_URL && SIGAP_KUNCI_INTERNAL ? new PengirimTranskripSupabase(SUPABASE_URL, SIGAP_KUNCI_INTERNAL) : new PengirimTranskripTiruan(),
  onGalat: (e) => console.error(JSON.stringify({ ev: 'transkrip_galat', jenis: e instanceof Error ? e.message : 'unknown' })),
});
// Panggilan aktif untuk dashboard (REQ-4.2): lewat Edge Function dengan kunci internal, tanpa service_role.
const pantau = new PemantauPanggilan({
  pelapor: SUPABASE_URL && SIGAP_KUNCI_INTERNAL ? new PelaporPanggilanSupabase(SUPABASE_URL, SIGAP_KUNCI_INTERNAL) : new PelaporPanggilanTiruan(),
  // Laporan pertama membuat baris percakapan; transkrip baru ditulis setelahnya.
  saatTercatat: (id) => pencatat.tercatat(id),
  konteks: (id) => ({ layanan: riwayat.layanan(id), eskalasi: riwayat.eskalasi(id) !== null }),
  // Panggilan yang sedang mengumpulkan pengaduan tidak ditutup selama jeda bicara; batas atasnya ada di PemantauPanggilan.
  tahan: (id) => pengaduan.aktif(id),
  onGalat: (e) => console.error(JSON.stringify({ ev: 'pantau_galat', jenis: e instanceof Error ? e.message : 'unknown' })),
});
pantau.mulai();
let korpus = null;
try {
  const mulai = Date.now();
  korpus = Korpus.muat(DIREKTORI_KORPUS);
  console.info(JSON.stringify({ ev: 'korpus', potongan: korpus.potongan.length, ms: Date.now() - mulai }));
} catch (e) {
  console.error(JSON.stringify({ ev: 'korpus_gagal', jenis: e instanceof Error ? e.code ?? e.message : 'unknown' }));
}
// REQ-2.5: panggilan pengaduan yang berakhir sebelum data lengkap disimpan tanpa tiket. Log hanya memuat jumlah data, bukan isinya.
async function akhiriPengaduan(id) {
  const hasil = await pengaduan.panggilanBerakhir(id);
  if (hasil) console.info(JSON.stringify({ ev: 'pengaduan', tahap: 'tidak_lengkap', data_terkumpul: hasil.lengkap, tersimpan: hasil.tersimpan }));
  return hasil && { pesan: hasil.pesan, tersimpan: hasil.tersimpan };
}
// Koneksi putus tanpa "Akhiri Panggilan" (tab ditutup, jaringan hilang): sesi yang tidak aktif dibuang dan pengaduannya disimpan.
riwayat.saatDibuang = (id) => { akhiriPengaduan(id).catch(() => {}).finally(() => pantau.akhiri(id)).finally(() => pencatat.akhiri(id)); };
riwayat.dilindungi = (id) => pengaduan.aktif(id);
setInterval(() => riwayat.bersihkan(), 60_000).unref();

let katalog = { status: SUPABASE_URL && SIGAP_KUNCI_INTERNAL ? 'menunggu' : 'tidak_dikonfigurasi' };
async function sinkronKatalog() {
  if (!korpus || katalog.status === 'tidak_dikonfigurasi') return;
  try {
    const baris = await new KatalogMateriSupabase({ url: SUPABASE_URL, kunci: SIGAP_KUNCI_INTERNAL }).ambil();
    const hasil = korpus.terapkanKatalog(baris);
    katalog = { status: baris.length ? 'aktif' : 'kosong', materi: baris.length, ...hasil, waktu: new Date().toISOString() };
    console.info(JSON.stringify({ ev: 'katalog', ...katalog }));
  } catch (e) {
    // Katalog terakhir tetap dipakai; kegagalan sementara tidak menghentikan layanan.
    katalog = { ...katalog, galat: e instanceof Error ? e.message : 'unknown' };
    console.error(JSON.stringify({ ev: 'katalog_gagal', galat: katalog.galat }));
  }
}
sinkronKatalog();
setInterval(sinkronKatalog, SINKRON_KATALOG_MS).unref();
const lajuGiliran = new PembatasLaju(30, 5 * 60 * 1000);
// Satu token per sesi mendengarkan, jadi batasnya sama dengan giliran; setiap detik audio realtime ditagih ElevenLabs.
const lajuSttRealtime = new PembatasLaju(30, 5 * 60 * 1000);
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
  const r = await fetch(`${ELEVENLABS_URL}/v1/speech-to-text`, {
    method: 'POST', headers: { 'xi-api-key': ELEVENLABS_KEY }, body: form, signal: AbortSignal.timeout(BATAS_WAKTU_STT_MS),
  });
  if (!r.ok) throw Object.assign(new Error(`stt ${r.status}`), { status: r.status });
  const d = await r.json();
  return String(d.text ?? '').replace(/\s+/g, ' ').trim().slice(0, PANJANG_MAKS_UCAPAN);
}

// Jawaban dialirkan (stream) per potongan agar kalimat pertama bisa diubah menjadi suara sebelum jawaban selesai.
// Hermes mengabaikan max_tokens, jadi panjang jawaban dijaga lewat prompt dan SusunanJawaban, pemakaian lewat AnggaranToken.
async function* aliranHermes(id, kutipan, hasil, sinyal) {
  const pesan = riwayat.untukModel(id, kutipan);
  hasil.karPrompt = JSON.stringify(pesan).length;
  const r = await fetch(`${HERMES_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${HERMES_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: HERMES_MODEL, messages: pesan, stream: true }),
    signal: AbortSignal.any([AbortSignal.timeout(BATAS_WAKTU_HERMES_MS), sinyal]),
  });
  if (!r.ok || !r.body) throw new Error(`hermes ${r.status}`);
  const dekoder = new TextDecoder();
  let sisa = '', awal = '';
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
      if (!potongan) continue;
      // Saat semua provider gagal, Hermes mengirim pemberitahuan berawalan "⚠️" sebagai isi jawaban (status 200).
      // Pemberitahuan itu tidak boleh dibacakan ke penelepon, jadi diperlakukan sebagai galat.
      if (awal.trim().length < 2) {
        awal += potongan;
        if (awal.trim().length < 2) continue;
        if (pesanGalatHermes(awal)) throw new Error('hermes tanpa jawaban');
        hasil.karKeluaran += awal.length;
        yield awal;
        continue;
      }
      hasil.karKeluaran += potongan.length;
      yield potongan;
    }
  }
  // Jawaban yang sangat pendek (kurang dari dua karakter) belum sempat dikirim di atas.
  if (awal.trim() && awal.trim().length < 2) { hasil.karKeluaran += awal.length; yield awal; }
}

/** Pemberitahuan internal Hermes (misalnya "⚠️ No reply: every provider ... failed"), bukan jawaban model. */
const pesanGalatHermes = (teks) => /^\s*(⚠|\[?error\b)/iu.test(teks);

// Semua render TTS (token suara, pesan statis, render saat mulai) lewat sini, jadi kondisinya terukur di satu tempat.
function ttsElevenLabs(teks) {
  return kondisi.ukur('tts', async () => {
    const url = `${ELEVENLABS_URL}/v1/text-to-speech/${ELEVENLABS_SUARA}/stream?output_format=mp3_44100_64`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: teksUntukSuara(teks), model_id: ELEVENLABS_MODEL_TTS, language_code: 'id', voice_settings: { stability: ELEVENLABS_STABILITAS },
      }),
      signal: AbortSignal.timeout(BATAS_WAKTU_TTS_MS),
    });
    if (!r.ok || !r.body) throw Object.assign(new Error(`tts ${r.status}`), { status: r.status });
    return r.body;
  });
}

/** POST /voice/giliran: JSON {id, pilih} untuk tombol menu, JSON {id, teks} untuk pesan diketik, atau audio mentah (?id=) untuk ucapan. */
async function giliran(req, res, url) {
  if (!lajuGiliran.izinkan(ipKlien(req))) throw new ErrorGateway(429, 'Terlalu banyak permintaan. Coba lagi sebentar lagi.');
  const tipe = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();

  let ketik = null;
  let id;
  if (tipe === 'application/json') {
    let body;
    try { body = JSON.parse((await bacaBody(req, JSON_MAKS_BYTE)).toString('utf8')); } catch { throw new ErrorGateway(400, 'Permintaan tidak valid.'); }
    const urai = uraiGiliranJson(body);
    if (urai.galat) throw new ErrorGateway(urai.galat.kode, urai.galat.pesan);
    id = urai.id;
    if (urai.jenis === 'pilih') {
      const menu = pilihMenu(riwayat, pengaduan, id, urai.pilih, pantau);
      if (!menu) throw new ErrorGateway(422, 'Pilihan layanan tidak dikenal.');
      // Panel mengucapkan menu sebelum setiap pilihan (awal panggilan dan "ganti layanan").
      pencatat.giliran(id, null, PESAN_MENU);
      pencatat.giliran(id, null, menu.jawaban);
      return kirim(res, 200, 'success', 'OK', { transkrip: null, jawaban: menu.jawaban, suara: menu.suara });
    }
    // Pesan yang diketik: tanpa STT, selebihnya sama dengan giliran suara.
    ketik = urai.teks;
  } else {
    if (!tipe.startsWith('audio/') && !tipe.startsWith('video/')) throw new ErrorGateway(415, 'Format rekaman tidak didukung.');
    id = url.searchParams.get('id');
    if (!idPanggilanSah(id)) throw new ErrorGateway(400, 'Permintaan tidak valid.');
  }
  const ip = ipKlien(req);
  // Sebelum STT: batasi giliran serentak dan cadangkan token, supaya permintaan paralel ikut terhitung
  // dan panggilan yang anggarannya habis tidak ikut memakai kuota ElevenLabs.
  if ((giliranAktif.get(ip) ?? 0) >= GILIRAN_SERENTAK_PER_IP) throw new ErrorGateway(429, 'Terlalu banyak permintaan. Coba lagi sebentar lagi.');
  const batasAi = anggaranAi.cadangkan(ip, id, PERKIRAAN_TOKEN_GILIRAN);
  if (batasAi) throw new ErrorGateway(429, PESAN_BATAS_AI[batasAi]);
  giliranAktif.set(ip, (giliranAktif.get(ip) ?? 0) + 1);
  let cadangan = PERKIRAAN_TOKEN_GILIRAN;
  // Penelepon memutus panggilan sebelum jawaban selesai: hentikan stream Hermes dan jangan render TTS lagi.
  const batal = new AbortController();
  res.on('close', () => { if (!res.writableFinished) batal.abort(); });
  try {
    let audio = null;
    if (ketik === null) {
      audio = await bacaBody(req, AUDIO_MAKS_BYTE);
      if (audio.length < 1000) throw new ErrorGateway(422, 'Suara tidak terdengar. Silakan ulangi.');
      pantau.tahap(id, TAHAP.MENDENGAR);
    }

    const mulai = Date.now();
    const transkrip = ketik ?? await kondisi.ukur('stt', () => sttElevenLabs(audio, tipe));
    const tStt = Date.now() - mulai;
    // Penelepon sudah memutus panggilan: Hermes belum dipanggil, jadi cadangan token dikembalikan di finally luar.
    if (batal.signal.aborted) return;

    // Jawaban dikirim sebagai NDJSON: transkrip lebih dulu (dengan tanda putar kalimat jeda bila AI dipanggil),
    // lalu tiap kalimat beserta suaranya begitu siap, terakhir sumber dan status panggilan.
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' });
    const tulis = (baris) => res.write(`${JSON.stringify(baris)}\n`);
    // NFR-20: kalimat yang diucapkan ke penelepon dikumpulkan lalu dicatat bersama ucapannya di finally, satu titik untuk semua jalur.
    const terucap = [];
    let tKalimat1 = null;
    const ucapkan = (teks, suara) => { tKalimat1 ??= Date.now() - mulai; terucap.push(teks); tulis({ jenis: 'kalimat', teks, suara }); };
    try {
      if (!transkrip) {
        tulis({ jenis: 'transkrip', transkrip: '' });
        tulis({ jenis: 'selesai' });
        return;
      }
      pantau.tahap(id, TAHAP.MEMPROSES);

      // T-F4.1-02, T-F4.2-02 (REQ-2.2, REQ-2.3): alur pengaduan seluruhnya di gateway, tanpa AI. Data kurang ditanyakan ulang;
      // begitu lengkap tiket terbit lewat Edge Function. Ucapan mentah tidak masuk riwayat dan tidak pernah sampai ke model.
      if (pengaduan.aktif(id)) {
        tulis({ jenis: 'transkrip', transkrip });
        let hasil;
        try {
          hasil = await prosesGiliranPengaduan({ pengaduan, riwayat, id, ucapan: transkrip, ip });
        } catch (e) {
          if (e instanceof BatasTiketTercapai) {
            console.info(JSON.stringify({ ev: 'pengaduan', tahap: 'ditolak', batas: e.jenis }));
            throw new ErrorGateway(429, 'Batas penerbitan tiket hari ini sudah tercapai. Silakan coba lagi besok.');
          }
          throw e;
        }
        // Tiket tetap terbit walau penelepon sudah memutus; hanya render suaranya yang dilewati.
        const suara = hasil.tiket ? (batal.signal.aborted ? null : terbitkanTokenSuara(hasil.jawaban, ip)) : hasil.suara;
        console.info(JSON.stringify({ ev: 'pengaduan', tahap: hasil.tahap, kurang: hasil.kurang, stt_ms: tStt }));
        pantau.tahap(id, TAHAP.MENJAWAB);
        ucapkan(hasil.jawaban, suara);
        tulis({ jenis: 'selesai', sumber: [], pengaduan: hasil.tiket });
        return;
      }

      // UC-01 Alternative Path 3: "dua", "tekan 2", atau niat mengadu setelah tawaran tekan 2 memilih layanan pengaduan, tanpa AI.
      const menuUcapan = menuDariUcapan(transkrip, riwayat.jawabanTerakhir(id));
      if (menuUcapan) {
        const menu = pilihMenu(riwayat, pengaduan, id, menuUcapan);
        tulis({ jenis: 'transkrip', transkrip });
        console.info(JSON.stringify({ ev: 'giliran', stt_ms: tStt, menu: menuUcapan, token: 0 }));
        pantau.tahap(id, TAHAP.MENJAWAB);
        ucapkan(menu.jawaban, menu.suara);
        tulis({ jenis: 'selesai', sumber: [], layanan: menuUcapan });
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
          // SRS Tabel B.2 Alternative Path 2 langkah 7: basis pengetahuan dicari dan tercatat di log_tool, tetapi hasilnya
          // dibuang karena pertanyaan medis tidak dijawab AI (NFR-6). Status eskalasi sudah diambil sebelum await.
          await cariBasisPengetahuan({
            pencari: pencariPengetahuan, korpus, pertanyaan: transkrip, catat: (e) => console.error(JSON.stringify(e)),
            saatLokal: (ms, berhasil) => pencatat.tool(id, TOOL_PENGETAHUAN, ms, berhasil),
          });
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
            // Tiket tetap terbit walau penelepon sudah memutus; hanya render suaranya yang dilewati.
            suara = batal.signal.aborted ? null : terbitkanTokenSuara(jawaban, ip);
          } else {
            jawaban = PESAN_MINTA_ULANG_TELEPON;
            suara = '/voice/statis/ulang-telepon';
          }
        }
        riwayat.tambah(id, 'assistant', jawaban);
        console.info(JSON.stringify({ ev: 'eskalasi', tahap: tiket ? 'tiket' : pertanyaanEskalasi === null ? 'minta_telepon' : 'ulang_telepon', stt_ms: tStt }));
        pantau.tahap(id, TAHAP.MENJAWAB);
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
      // Kalimat jeda juga menutupi waktu cek registrasi di cekbpom (paling lama 5 detik).
      tulis({ jenis: 'transkrip', transkrip, jeda: true });
      // Pertanyaan status registrasi suatu produk dijawab tool cek_registrasi_bpom, selain itu tool cari_basis_pengetahuan.
      // Selama alur pengaduan (layanan 2) nama produk adalah data pengaduan, jadi tidak dicek di cekbpom.
      const tCek = Date.now();
      const keadaanCek = riwayat.cekRegistrasi(id);
      // Panel Cari Produk di halaman publik mulai mengetik kueri saat pencarian dimulai, lalu menampilkan tabel sebelum AI menjawab.
      const cek = cekBpom && riwayat.layanan(id) !== 2
        ? await cekRegistrasiBpom(cekBpom, transkrip, { ...keadaanCek, jawabanTerakhir: riwayat.jawabanTerakhir(id), saatMencari: (k) => tulis({ jenis: 'cari', kueri: labelKueri(k) }) })
        : null;
      // Kandidat hasil ganda hanya berlaku untuk giliran tepat sesudahnya.
      riwayat.aturCekRegistrasi(id, cek?.keadaan ?? { ...keadaanCek, kandidat: null });
      let konteks, kutipan = [];
      if (cek) {
        if (cek.kueri) tulis({ jenis: 'cek', ...tabelCek(cek.kueri, cek.data) });
        if (cek.galat) console.error(JSON.stringify({ ev: 'cekbpom_gagal', jenis: cek.galat }));
        const jenis = cek.kueri ? (cek.kueri.nomor ? 'nomor' : 'nama') : null;
        const ms = Date.now() - tCek;
        console.info(JSON.stringify({ ev: 'cekbpom', jalur: cek.jalur, jenis, hasil: cek.total, ms }));
        if (cek.kueri) {
          kondisi.catat('cekbpom', !cek.galat, ms);
          pencatat.tool(id, TOOL_CEK_REGISTRASI, ms, !cek.galat);
        }
        konteks = cek.konteks;
      } else {
        const basis = await cariBasisPengetahuan({
          pencari: pencariPengetahuan, korpus, pertanyaan: transkrip, catat: (e) => console.error(JSON.stringify(e)),
          saatLokal: (ms, berhasil) => pencatat.tool(id, TOOL_PENGETAHUAN, ms, berhasil),
        });
        kutipan = basis.kutipan.slice(0, KUTIPAN_MAKS);
        konteks = pesanBasisPengetahuan(kutipan);
      }
      if (batal.signal.aborted) return;
      if (cek?.jawaban) {
        // NFR-7: hasil tunggal, hasil ganda, tidak ditemukan, dan nama tidak jelas memakai kalimat baku tanpa AI.
        // Tawaran penutup diucapkan terpisah agar memakai audio statisnya.
        const isi = cek.jawaban.endsWith(PESAN_TAWARAN_PENUTUP) ? cek.jawaban.slice(0, -PESAN_TAWARAN_PENUTUP.length).trim() : cek.jawaban;
        const statis = Object.keys(SUARA_STATIS).find((k) => SUARA_STATIS[k] === isi);
        ucapkan(isi, statis ? `/voice/statis/${statis}` : terbitkanTokenSuara(isi, ip));
        if (isi !== cek.jawaban) ucapkan(PESAN_TAWARAN_PENUTUP, '/voice/statis/tawaran-penutup');
        riwayat.tambah(id, 'assistant', cek.jawaban);
        console.info(JSON.stringify({ ev: 'giliran', stt_ms: tStt, total_ms: Date.now() - mulai, jalur: cek.jalur, token: 0 }));
        pantau.tahap(id, TAHAP.MENJAWAB);
        tulis({ jenis: 'selesai', sumber: [], produk: cek.produk });
        return;
      }
      const susunan = new SusunanJawaban(PESAN_BUTUH_PETUGAS);
      const hasil = { token: 0, karPrompt: 0, karKeluaran: 0 };
      const ucapkanKalimat = (ucap) => ucapkan(ucap, terbitkanTokenSuara(ucap, ip));
      // NFR-1: latensi Hermes di Pantau AI Agent adalah waktu sampai kalimat pertama siap, bukan sampai jawaban selesai.
      // Panggilan yang dibatalkan penelepon tidak dinilai; jawaban kosong dan pemberitahuan galat Hermes dihitung gangguan.
      const tHermes = Date.now();
      try {
        await alirkanJawaban(aliranHermes(id, konteks, hasil, batal.signal), susunan, ucapkanKalimat, batal.signal);
        if (!batal.signal.aborted) kondisi.catat('hermes', hasil.karKeluaran > 0, (tKalimat1 ? mulai + tKalimat1 : Date.now()) - tHermes);
      } catch (e) {
        kondisi.catat('hermes', false, Date.now() - tHermes);
        throw e;
      } finally {
        hasil.token = tokenTerpakai(hasil, batal.signal.aborted);
        anggaranAi.catat(ip, id, hasil.token - cadangan);
        cadangan = 0;
      }
      if (batal.signal.aborted) {
        // Tidak ada yang mendengar lagi: lewati jawaban pengganti (render TTS), tawaran penutup, dan baris selesai. Kalimat yang sudah
        // terkirim tetap masuk riwayat agar giliran berikutnya (bila koneksi hanya putus sesaat) tidak melihat dua ucapan
        // user berturut-turut. Tawaran penutup belum terucap, jadi tidak ikut dicatat.
        if (susunan.isi.length) riwayat.tambah(id, 'assistant', susunan.isi.join(' '));
        console.info(JSON.stringify({ ev: 'giliran', batal: true, stt_ms: tStt, total_ms: Date.now() - mulai, kalimat: susunan.isi.length, token: hasil.token }));
        return;
      }

      let jawaban = susunan.teks;
      const diLuarTopik = susunan.khusus === 'di_luar_topik';
      // Jawaban baku baru dikenali setelah kalimat isi terkirim: panel membuang audio yang belum diputar dan teksnya.
      if (susunan.khusus && susunan.isi.length) {
        tulis({ jenis: 'ganti' });
        terucap.length = 0;
      }
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
      } else {
        // NFR-8: jawaban edukasi ditutup kalimat Sumber dari rujukan kutipan, sebelum tawaran penutup.
        const sumberLisan = susunan.lengkapiSumber(kalimatSumber(kutipan));
        if (sumberLisan) {
          ucapkan(sumberLisan, terbitkanTokenSuara(sumberLisan, ip));
          jawaban = susunan.teks;
        }
        if (susunan.tawaran) ucapkan(PESAN_TAWARAN_PENUTUP, '/voice/statis/tawaran-penutup');
      }
      riwayat.tambah(id, 'assistant', jawaban);
      console.info(JSON.stringify({
        ev: 'giliran', stt_ms: tStt, kalimat1_ms: tKalimat1, total_ms: Date.now() - mulai, ucapan_kar: transkrip.length,
        jawaban_kar: jawaban.length, kalimat: susunan.isi.length, kutipan: kutipan.length, di_luar_topik: diLuarTopik,
        token: hasil.token, token_hari_ini: anggaranAi.total,
      }));
      // Hasil cekbpom tampil sebagai kartu produk, dan jawaban baku atau yang merujuk ke cekbpom tidak memakai kutipan,
      // jadi semuanya tanpa chip sumber.
      const produk = diLuarTopik ? undefined : cek?.produk;
      const sumber = susunan.khusus || produk || /cekbpom/i.test(jawaban) ? [] : sumberUntukPanel(kutipan);
      pantau.tahap(id, TAHAP.MENJAWAB);
      tulis({ jenis: 'selesai', sumber, produk });
    } catch (e) {
      if (!(e instanceof ErrorGateway)) console.error(JSON.stringify({ ev: 'galat', path: '/voice/giliran', jenis: e instanceof Error ? e.message : 'unknown' }));
      tulis({ jenis: 'galat', message: e instanceof ErrorGateway ? e.message : PESAN_GANGGUAN });
    } finally {
      pencatat.giliran(id, transkrip, terucap.join(' '));
      // NFR-1 untuk semua jalur: waktu kalimat pertama dikirim, sebelum render TTS-nya selesai (batas bawah, lihat ADR 0005).
      // null berarti tidak ada yang terucap (galat atau batal).
      if (transkrip) console.info(JSON.stringify({ ev: 'respons', stt_ms: tStt, kalimat1_ms: tKalimat1 }));
      res.end();
    }
  } finally {
    // AI tidak jadi dipanggil (ucapan kosong, tersaring, atau galat): kembalikan cadangan.
    if (cadangan) anggaranAi.catat(ip, id, -cadangan);
    const sisa = (giliranAktif.get(ip) ?? 1) - 1;
    if (sisa > 0) giliranAktif.set(ip, sisa); else giliranAktif.delete(ip);
  }
}

/**
 * POST /voice/stt-realtime {id}: alamat WebSocket STT realtime dengan token sekali pakai untuk satu sesi mendengarkan.
 * 404 bila dimatikan atau kunci ElevenLabs tidak ada; panel lalu memakai rekam lalu unggah (/voice/giliran audio).
 */
async function sesiSttRealtime(req, res) {
  if (!STT_REALTIME || !ELEVENLABS_KEY) throw new ErrorGateway(404, 'Tidak ditemukan.');
  if (!lajuSttRealtime.izinkan(ipKlien(req))) throw new ErrorGateway(429, 'Terlalu banyak permintaan. Coba lagi sebentar lagi.');
  let body;
  try { body = JSON.parse((await bacaBody(req, JSON_MAKS_BYTE)).toString('utf8')); } catch { throw new ErrorGateway(400, 'Permintaan tidak valid.'); }
  if (!idPanggilanSah(body?.id)) throw new ErrorGateway(400, 'Permintaan tidak valid.');
  const token = await kondisi.ukur('stt', () => buatTokenSttRealtime(ELEVENLABS_KEY));
  return kirim(res, 200, 'success', 'OK', { url: alamatSttRealtime(token) });
}

async function suara(req, res, token) {
  const entri = tokenSuara.get(token);
  if (!entri || entri.kedaluwarsa < Date.now()) throw new ErrorGateway(404, 'Suara tidak ditemukan.');
  // Safari meminta media lebih dari sekali (Range bytes=0-1, lalu isinya), jadi audio disimpan utuh sampai token kedaluwarsa
  // dan tidak dihapus pada permintaan pertama. Sebelumnya permintaan kedua mendapat 404 dan jawaban tidak terdengar di iPhone.
  entri.audio ??= entri.render.then(async (aliran) => Buffer.from(await new Response(aliran).arrayBuffer()));
  kirimAudio(req, res, await entri.audio, 'no-store');
}

// Promise disimpan agar permintaan bersamaan berbagi satu render; dibuang hanya bila render gagal.
async function statis(req, res, nama) {
  const teks = Object.hasOwn(SUARA_STATIS, nama) ? SUARA_STATIS[nama] : null;
  if (!teks) throw new ErrorGateway(404, 'Suara tidak ditemukan.');
  if (!suaraStatis.has(nama)) {
    const render = ttsElevenLabs(teks).then(async (aliran) => Buffer.from(await new Response(aliran).arrayBuffer()));
    render.catch(() => suaraStatis.delete(nama));
    suaraStatis.set(nama, render);
  }
  kirimAudio(req, res, await suaraStatis.get(nama), 'public, max-age=3600');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://gateway');
  const path = url.pathname;
  try {
    if (req.method === 'GET' && path === '/voice/kesehatan') {
      return kirim(res, 200, 'success', 'OK', {
        siap: Boolean(ELEVENLABS_KEY && HERMES_KEY), korpus: korpus?.potongan.length ?? 0,
        katalog: {
          status: katalog.status, materi: katalog.materi ?? 0, nonaktif: katalog.nonaktif ?? 0, tambahan: katalog.tambahan ?? 0,
          tanpaKatalog: katalog.tanpaKatalog ?? 0,
        },
        hermes: kondisi.terakhir.hermes, stt: kondisi.terakhir.stt, tts: kondisi.terakhir.tts,
        cekbpom: { aktif: Boolean(cekBpom), ...(kondisi.terakhir.cekbpom ?? {}) },
      });
    }
    if (req.method === 'POST' && ASAL_SITUS && req.headers.origin !== ASAL_SITUS) throw new ErrorGateway(403, 'Akses ditolak.');
    if (req.method === 'GET' && path.startsWith('/voice/statis/')) return await statis(req, res, path.slice('/voice/statis/'.length));
    if (req.method === 'GET' && path.startsWith('/voice/suara/')) return await suara(req, res, path.slice('/voice/suara/'.length));
    if (req.method === 'POST' && path === '/voice/giliran') return await giliran(req, res, url);
    if (req.method === 'POST' && path === '/voice/stt-realtime') return await sesiSttRealtime(req, res);
    if (req.method === 'POST' && path === '/voice/akhiri') {
      const body = JSON.parse((await bacaBody(req, JSON_MAKS_BYTE)).toString('utf8') || '{}');
      if (!idPanggilanSah(body.id)) return kirim(res, 200, 'success', 'OK');
      // REQ-2.5: pengaduan yang belum bertiket disimpan sebagai pengaduan tidak lengkap; pesannya dikirim ke panel.
      const akhir = await akhiriPengaduan(body.id);
      await pantau.akhiri(body.id);
      riwayat.hapus(body.id);
      return kirim(res, 200, 'success', 'OK', akhir);
    }
    return kirim(res, 404, 'error', 'Tidak ditemukan.');
  } catch (e) {
    if (res.headersSent) { res.destroy(); return; }
    if (e instanceof ErrorGateway) return kirim(res, e.kode, 'error', e.message);
    if (e instanceof SesiPenuh) return kirim(res, 503, 'error', 'Layanan sedang penuh. Coba lagi sebentar lagi.');
    if (e instanceof PercakapanDitolak) return kirim(res, 409, 'error', 'Percakapan ini tidak dapat dilanjutkan. Silakan mulai panggilan baru.');
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
