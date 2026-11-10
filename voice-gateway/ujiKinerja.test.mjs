import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BATAS_NFR_1_MS, ringkas } from './ujiKinerja.mjs';

test('nfr_1 ringkas menghitung p50 dan p95 nearest-rank, memisahkan giliran tanpa kalimat, dan menilai lulus terhadap batas', () => {
  const nilai = [null, ...Array.from({ length: 20 }, (_, i) => (i + 1) * 100), 4000];
  assert.deepEqual(ringkas(nilai, BATAS_NFR_1_MS), { n: 21, tanpa: 1, p50: 1100, p95: 2000, maks: 4000, lulus: true });
  // Kalimat yang terucap dalam 0 ms (jalur tanpa AI) tetap dihitung, bukan dianggap tanpa kalimat.
  assert.equal(ringkas([0, 10]).n, 2);
  assert.equal(ringkas([2900, 3100, 3200], 3000).lulus, false);
  assert.deepEqual(ringkas([null]), { n: 0, tanpa: 1, p50: null, p95: null, maks: null, lulus: false });
});

test('nfr_1 setiap giliran mencatat kalimat1_ms di satu titik untuk semua jalur', () => {
  const server = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
  assert.match(server, /const ucapkan = \(teks, suara\) => \{ tKalimat1 \?\?= Date\.now\(\) - mulai; /);
  assert.match(server, /catatGiliran\(id, ip, transkrip, terucap\.join\(' '\)\);\n(?: {6}\/\/.*\n)* {6}if \(transkrip\) console\.info\(JSON\.stringify\(\{ ev: 'respons', stt_ms: tStt, kalimat1_ms: tKalimat1 \}\)\);/);
  assert.equal(server.match(/tKalimat1 (\?\?|\|\|)?= /g)?.length, 2, 'hanya deklarasi dan ucapkan() yang mengisi tKalimat1');
});

test('nfr_4 uji beban memakai adapter tiruan: STT dan TTS server.mjs lewat ELEVENLABS_URL', () => {
  const server = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /api\.elevenlabs\.io\/v1/);
  assert.match(server, /fetch\(`\$\{ELEVENLABS_URL\}\/v1\/speech-to-text`/);
  assert.match(server, /`\$\{ELEVENLABS_URL\}\/v1\/text-to-speech\//);
});
