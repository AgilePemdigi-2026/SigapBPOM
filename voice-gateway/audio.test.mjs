import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kirimAudio, rentangByte } from './audio.mjs';

test('req_1_1 rentang byte dari header Range satu bagian', () => {
  assert.deepEqual(rentangByte('bytes=0-1', 100), { awal: 0, akhir: 1 });
  assert.deepEqual(rentangByte('bytes=10-', 100), { awal: 10, akhir: 99 });
  assert.deepEqual(rentangByte('bytes=-20', 100), { awal: 80, akhir: 99 });
  assert.deepEqual(rentangByte('bytes=90-500', 100), { awal: 90, akhir: 99 });
  assert.equal(rentangByte('bytes=100-', 100), 'salah');
  assert.equal(rentangByte(undefined, 100), null);
  assert.equal(rentangByte('bytes=0-1,5-9', 100), null);
});

function rekamRespons() {
  const r = { status: 0, kepala: {}, isi: null };
  return { r, res: { writeHead(s, k) { r.status = s; r.kepala = k; }, end(b) { r.isi = b ?? null; } } };
}

test('req_1_1 Safari meminta bytes=0-1 lalu sisanya: dijawab 206 dengan Content-Range, audio utuh tetap tersedia', () => {
  const audio = Buffer.from('ID3-audio-mp3');
  const awal = rekamRespons();
  kirimAudio({ headers: { range: 'bytes=0-1' } }, awal.res, audio, 'no-store');
  assert.equal(awal.r.status, 206);
  assert.equal(awal.r.kepala['content-range'], `bytes 0-1/${audio.length}`);
  assert.equal(awal.r.kepala['content-length'], 2);
  assert.equal(awal.r.isi.toString(), 'ID');

  const penuh = rekamRespons();
  kirimAudio({ headers: {} }, penuh.res, audio, 'no-store');
  assert.equal(penuh.r.status, 200);
  assert.equal(penuh.r.kepala['accept-ranges'], 'bytes');
  assert.equal(penuh.r.kepala['content-length'], audio.length);
  assert.equal(penuh.r.isi.toString(), 'ID3-audio-mp3');

  const salah = rekamRespons();
  kirimAudio({ headers: { range: 'bytes=999-' } }, salah.res, audio, 'no-store');
  assert.equal(salah.r.status, 416);
});
