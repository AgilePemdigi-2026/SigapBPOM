// Berawalan "_" agar Astro tidak menjadikannya route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const halaman = readFileSync(new URL('./login.astro', import.meta.url), 'utf8');

test('req_3_5 halaman login tidak menghitung percobaan gagal di browser', () => {
  assert.doesNotMatch(halaman, /sigap-gagal-login|Percobaan gagal|sigap-aktif/);
});

test('req_3_4 keterangan penguncian hanya tampil pada kredensial salah', () => {
  // Tanpa aturan [hidden], display: block milik .err-hint mengalahkan atribut hidden.
  assert.match(halaman, /\.err-hint\[hidden\] \{ display: none; \}/);
  assert.match(halaman, /errHint\.hidden = msg !== MSG\.salah;/);
});

test('req_3_5 kotak informasi di bawah formulir menjelaskan pesan akses dikunci (SRS 3.1.3)', () => {
  assert.match(halaman, /class="info"[\s\S]*Bila muncul pesan "Akses dikunci sementara\. Hubungi administrator\."/);
});
