// Menguji fungsi murni di AudioWorklet transkrip live (public/worklet/pcm16.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error berkas JS publik tanpa deklarasi tipe
import { turunkan } from '../../public/worklet/pcm16.js';

test('req_1_2 audio 48 kHz diturunkan ke 16 kHz dengan rata-rata tiap tiga sampel', () => {
  const { pcm, sisa } = turunkan(new Float32Array([0.5, 0.5, 0.5, -1, -1, -1, 0.25]), 3);
  assert.deepEqual([...pcm], [Math.trunc(0.5 * 0x7fff), -0x8000]);
  assert.deepEqual([...sisa], [0.25]);
});

test('req_1_2 sample rate tidak bulat (44,1 kHz) dan nilai di luar rentang tetap menghasilkan Int16 yang sah', () => {
  const masuk = new Float32Array(128).fill(2);
  const { pcm, sisa } = turunkan(masuk, 44100 / 16000);
  assert.equal(pcm.length, 46);
  assert.ok(pcm.every((s: number) => s === 0x7fff));
  assert.equal(sisa.length, 128 - Math.floor(46 * (44100 / 16000)));
});
