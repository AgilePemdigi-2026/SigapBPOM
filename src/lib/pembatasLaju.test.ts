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

test('ipKlien memakai entri terakhir X-Forwarded-For hanya dari proxy internal', () => {
  assert.equal(ipKlien(new Headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }), '172.18.0.2'), '203.0.113.9');
  assert.equal(ipKlien(new Headers(), '172.18.0.2'), '172.18.0.2');
  // Klien publik yang tersambung langsung tidak bisa memalsukan alamat lewat header.
  assert.equal(ipKlien(new Headers({ 'x-forwarded-for': '9.9.9.9' }), '198.51.100.7'), '198.51.100.7');
});

test('tabel penuh tidak membuang kunci yang sedang diblokir', () => {
  const p = new PembatasLaju({ maks: 1, now: () => 0 });
  p.izinkan('penyerang');
  assert.equal(p.izinkan('penyerang'), false);
  for (let i = 0; i < 6000; i++) p.izinkan(`ip-${i}`);
  assert.ok(p.percobaan.size <= 5000);
  assert.equal(p.izinkan('penyerang'), false);
});
