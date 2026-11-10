import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatIpKlien, buatCekOrigin } from './alamatKlien.mjs';

const req = (headers, remoteAddress = '172.18.0.5') => ({ headers, socket: { remoteAddress } });

test('tanpa konfigurasi proxy dipakai entri terakhir X-Forwarded-For', () => {
  const ip = buatIpKlien();
  assert.equal(ip(req({ 'x-forwarded-for': '9.9.9.9, 203.0.113.9' })), '203.0.113.9');
  assert.equal(ip(req({ 'x-sigap-ip-klien': '1.2.3.4', 'x-sigap-kunci-proxy': 'apa-saja', 'x-forwarded-for': '203.0.113.9' })), '203.0.113.9');
  assert.equal(ip(req({})), '172.18.0.5');
});

test('X-Sigap-Ip-Klien dipakai bila kunci proxy cocok', () => {
  const ip = buatIpKlien({ kunciProxy: 'rahasia-panjang' });
  const dasar = { 'x-forwarded-for': '210.57.215.234', 'x-sigap-ip-klien': '198.51.100.7' };
  assert.equal(ip(req({ ...dasar, 'x-sigap-kunci-proxy': 'rahasia-panjang' })), '198.51.100.7');
  assert.equal(ip(req({ ...dasar, 'x-sigap-kunci-proxy': 'salah' })), '210.57.215.234');
  assert.equal(ip(req(dasar)), '210.57.215.234');
});

test('X-Sigap-Ip-Klien dipakai bila permintaan datang dari PROXY_IP_TEPERCAYA', () => {
  const ip = buatIpKlien({ ipTepercaya: '210.57.215.234, 2001:db8::1' });
  assert.equal(ip(req({ 'x-forwarded-for': '210.57.215.234', 'x-sigap-ip-klien': '198.51.100.7' })), '198.51.100.7');
  // Klien lain tidak bisa memalsukan alamat dengan header yang sama.
  assert.equal(ip(req({ 'x-forwarded-for': '203.0.113.9', 'x-sigap-ip-klien': '198.51.100.7' })), '203.0.113.9');
  // Entri sebelum yang terakhir bisa dipalsukan, jadi tidak membuat permintaan tepercaya.
  assert.equal(ip(req({ 'x-forwarded-for': '210.57.215.234, 203.0.113.9', 'x-sigap-ip-klien': '198.51.100.7' })), '203.0.113.9');
  assert.equal(ip(req({ 'x-forwarded-for': '210.57.215.234' })), '210.57.215.234');
});

test('SITE_ORIGIN menerima beberapa origin dipisah koma', () => {
  const cek = buatCekOrigin('https://vps.example.id, https://sigapbpom.caiis.ai.id/');
  assert.equal(cek('https://sigapbpom.caiis.ai.id'), true);
  assert.equal(cek('https://vps.example.id'), true);
  assert.equal(cek('https://jahat.example'), false);
  assert.equal(cek(undefined), false);
  assert.equal(buatCekOrigin('')('https://apa.saja'), true);
});
