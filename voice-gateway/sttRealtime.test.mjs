import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alamatSttRealtime, buatTokenSttRealtime } from './sttRealtime.mjs';

test('req_1_2 token STT realtime diminta dengan kunci server dan dikembalikan apa adanya', async () => {
  const permintaan = [];
  const fetchFn = async (url, init) => { permintaan.push({ url, init }); return Response.json({ token: 'sutkn_uji' }); };
  assert.equal(await buatTokenSttRealtime('kunci-uji', fetchFn), 'sutkn_uji');
  assert.equal(permintaan[0].url, 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe');
  assert.equal(permintaan[0].init.method, 'POST');
  assert.equal(permintaan[0].init.headers['xi-api-key'], 'kunci-uji');
});

test('req_1_2 penolakan atau token kosong dari ElevenLabs menjadi galat, bukan token palsu', async () => {
  await assert.rejects(buatTokenSttRealtime('k', async () => new Response('{}', { status: 401 })), /stt_token 401/);
  await assert.rejects(buatTokenSttRealtime('k', async () => Response.json({})), /stt_token kosong/);
});

test('req_1_2 alamat sesi memakai PCM 16 kHz, bahasa Indonesia, dan commit VAD setelah jeda', () => {
  const url = new URL(alamatSttRealtime('sutkn_a/b'));
  assert.equal(url.origin + url.pathname, 'wss://api.elevenlabs.io/v1/speech-to-text/realtime');
  assert.equal(url.searchParams.get('token'), 'sutkn_a/b');
  assert.equal(url.searchParams.get('model_id'), 'scribe_v2_realtime');
  assert.equal(url.searchParams.get('audio_format'), 'pcm_16000');
  assert.equal(url.searchParams.get('language_code'), 'ind');
  assert.equal(url.searchParams.get('commit_strategy'), 'vad');
  assert.equal(url.searchParams.get('vad_silence_threshold_secs'), '0.8');
});
