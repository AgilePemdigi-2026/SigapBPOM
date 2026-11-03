// UC-01 (REQ-1.2, SRS 3.4.1): transkrip live. Panel tersambung langsung ke STT realtime ElevenLabs dengan token sekali pakai
// dari gateway, jadi kunci API tidak keluar dari server dan audio tidak melewati gateway. Teks yang sudah final dikirim panel
// sebagai giliran teks, sehingga batas laju, kuota AI, dan transkrip tetap berlaku di gateway.

const URL_TOKEN = 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe';
const URL_SESI = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';

/** Alamat WebSocket satu sesi: parameter ditetapkan server, panel mengirim PCM 16 kHz, VAD menutup ucapan setelah jeda. */
export function alamatSttRealtime(token, { model = 'scribe_v2_realtime', jedaDetik = 0.8 } = {}) {
  const p = new URLSearchParams({
    model_id: model, token, audio_format: 'pcm_16000', language_code: 'ind', commit_strategy: 'vad', vad_silence_threshold_secs: String(jedaDetik),
  });
  return `${URL_SESI}?${p}`;
}

/** Token sekali pakai, berlaku 15 menit dan habis begitu dipakai satu sesi. Melempar Error bila ElevenLabs menolak. */
export async function buatTokenSttRealtime(kunci, fetchFn = fetch) {
  const r = await fetchFn(URL_TOKEN, { method: 'POST', headers: { 'xi-api-key': kunci }, signal: AbortSignal.timeout(5_000) });
  if (!r.ok) throw new Error(`stt_token ${r.status}`);
  const { token } = await r.json().catch(() => ({}));
  if (typeof token !== 'string' || !token) throw new Error('stt_token kosong');
  return token;
}
