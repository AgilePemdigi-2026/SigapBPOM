import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PembatasLaju } from './pembatasLaju.ts';

test('percobaan melewati batas ditolak per kunci lalu pulih setelah jendela berlalu', () => {
  let t = 0;
  const p = new PembatasLaju({ maks: 3, jendelaMs: 1000, now: () => t });
  assert.deepEqual([1, 2, 3, 4].map(() => p.izinkan('1.1.1.1')), [true, true, true, false]);
  assert.equal(p.izinkan('2.2.2.2'), true);
  t = 1001;
  assert.equal(p.izinkan('1.1.1.1'), true);
});

test('percobaan yang ditolak tidak memperpanjang hukuman', () => {
  let t = 0;
  const p = new PembatasLaju({ maks: 1, jendelaMs: 1000, now: () => t });
  p.izinkan('a');
  t = 900;
  assert.equal(p.izinkan('a'), false);
  t = 1001;
  assert.equal(p.izinkan('a'), true);
});
