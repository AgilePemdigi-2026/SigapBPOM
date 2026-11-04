import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KondisiLayanan } from './kesehatan.mjs';

test('nfr_16 t_f5_4_01 kondisi layanan null sampai dipanggil lalu mencerminkan hasil dan latensi panggilan terakhir', async () => {
  const jam = { t: Date.UTC(2026, 10, 4) };
  const kondisi = new KondisiLayanan(() => jam.t);
  assert.deepEqual(kondisi.terakhir, { hermes: null, stt: null, tts: null, cekbpom: null });

  const hasil = await kondisi.ukur('stt', async () => { jam.t += 210; return 'halo'; });
  assert.equal(hasil, 'halo');
  assert.deepEqual(kondisi.terakhir.stt, { sehat: true, latensiMs: 210, waktu: new Date(jam.t).toISOString() });

  const galat = new Error('stt 401');
  await assert.rejects(kondisi.ukur('stt', async () => { jam.t += 90; throw galat; }), (e) => e === galat);
  assert.equal(kondisi.terakhir.stt.sehat, false, 'galat nyata menimpa hasil sehat sebelumnya');
  assert.equal(kondisi.terakhir.stt.latensiMs, 90);

  kondisi.catat('hermes', true, 812.6);
  assert.equal(kondisi.terakhir.hermes.latensiMs, 813);
  assert.equal(kondisi.terakhir.tts, null);
});

test('nfr_1 nfr_16 t_f5_4_01 server.mjs mengukur setiap panggilan Hermes, STT, dan TTS lalu melaporkannya di /voice/kesehatan', () => {
  const server = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
  assert.match(server, /kondisi\.ukur\('stt', \(\) => sttElevenLabs\(audio, tipe\)\)/);
  assert.match(server, /kondisi\.ukur\('stt', \(\) => buatTokenSttRealtime\(ELEVENLABS_KEY\)\)/);
  assert.match(server, /function ttsElevenLabs\(teks\) \{\n {2}return kondisi\.ukur\('tts', /);
  assert.equal(server.match(/kondisi\.catat\('hermes'/g)?.length, 2, 'jawaban selesai dan galat Hermes sama-sama dicatat');
  assert.match(server, /kondisi\.catat\('cekbpom', /);
  assert.match(server, /hermes: kondisi\.terakhir\.hermes, stt: kondisi\.terakhir\.stt, tts: kondisi\.terakhir\.tts,/);
  assert.doesNotMatch(server, /kondisiCekbpom/);
});
