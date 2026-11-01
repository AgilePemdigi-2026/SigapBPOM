import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PembatasLaju, ipKlien } from './pembatasLaju.ts';

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

test('ipKlien memakai entri terakhir X-Forwarded-For dari Caddy, bukan entri yang bisa dipalsukan', () => {
  assert.equal(ipKlien(new Headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }), '172.18.0.2'), '203.0.113.9');
  assert.equal(ipKlien(new Headers(), '172.18.0.2'), '172.18.0.2');
});

test('jumlah kunci dibatasi walau banyak alamat aktif', () => {
  const p = new PembatasLaju({ now: () => 0 });
  for (let i = 0; i < 6000; i++) p.izinkan(`ip-${i}`);
  assert.ok(p.percobaan.size <= 5001);
});
