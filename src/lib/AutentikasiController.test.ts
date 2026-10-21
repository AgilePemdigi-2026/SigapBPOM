import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AstroCookies } from 'astro';
import { AutentikasiController, PESAN_LOGIN, type AdapterSesi } from './AutentikasiController.ts';

const COOKIES = {} as AstroCookies;
const DEWI = { nama: 'Dewi Lestari', email: 'dewi.lestari@pom.go.id' };

function buat() {
  const panggilan: [string, string][] = [];
  const adapter: AdapterSesi = {
    async masuk(email, password) {
      panggilan.push([email, password]);
      return email === DEWI.email && password === 'benar' ? DEWI : null;
    },
    async baca() { return null; },
    async keluar() {},
  };
  return { c: new AutentikasiController(adapter), panggilan };
}

test('req_3_3 isian kosong ditolak sebelum kredensial diperiksa', async () => {
  const { c, panggilan } = buat();
  for (const input of [{}, { email: DEWI.email }, { email: '   ', password: 'benar' }, { email: 1, password: 2 }]) {
    assert.deepEqual(await c.masuk(input, COOKIES), { kode: 422, pesan: PESAN_LOGIN.kosong, petugas: null });
  }
  assert.equal(panggilan.length, 0);
});

test('req_3_4 kredensial salah memberi pesan yang sama untuk email dan password', async () => {
  const { c } = buat();
  const salah = { kode: 401, pesan: PESAN_LOGIN.salah, petugas: null };
  assert.deepEqual(await c.masuk({ email: 'tidak.ada@pom.go.id', password: 'benar' }, COOKIES), salah);
  assert.deepEqual(await c.masuk({ email: DEWI.email, password: 'keliru' }, COOKIES), salah);
});

test('req_3_2 login benar membentuk sesi dan memangkas spasi email', async () => {
  const { c, panggilan } = buat();
  assert.deepEqual(await c.masuk({ email: `  ${DEWI.email} `, password: 'benar' }, COOKIES), { kode: 200, pesan: PESAN_LOGIN.berhasil, petugas: DEWI });
  assert.deepEqual(panggilan, [[DEWI.email, 'benar']]);
});

test('isian melebihi batas panjang ditolak tanpa memanggil penyedia autentikasi', async () => {
  const { c, panggilan } = buat();
  assert.equal((await c.masuk({ email: DEWI.email, password: 'x'.repeat(257) }, COOKIES)).kode, 401);
  assert.equal(panggilan.length, 0);
});
