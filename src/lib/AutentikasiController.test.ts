import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AstroCookies } from 'astro';
import { AutentikasiController, PESAN_LOGIN, PembatasLajuLogin, type AdapterSesi } from './AutentikasiController.ts';

const COOKIES = {} as AstroCookies;
const DEWI = { nama: 'Dewi Lestari', email: 'dewi.lestari@pom.go.id' };

function buat(opsi: { batasLaju?: number; jendelaMs?: number; now?: () => number } = {}) {
  const panggilan: [string, string][] = [];
  const adapter: AdapterSesi = {
    async masuk(email, password) {
      panggilan.push([email, password]);
      return email === DEWI.email && password === 'benar' ? DEWI : null;
    },
    async baca() { return null; },
    async keluar() {},
    kunci() { return null; },
  };
  const pembatas = opsi.batasLaju
    ? new PembatasLajuLogin(opsi.batasLaju, opsi.jendelaMs ?? 60_000, opsi.now)
    : undefined;
  return { c: new AutentikasiController(adapter, { now: opsi.now, pembatasLaju: pembatas }), panggilan };
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

test('nfr_11 pembatas laju menolak setelah batas percobaan login per IP tercapai', async () => {
  let waktu = 1000;
  const { c } = buat({ batasLaju: 3, jendelaMs: 60_000, now: () => waktu });
  const ip = '192.168.1.10';

  // Percobaan 1-3 diizinkan (walaupun gagal karena password keliru)
  for (let i = 0; i < 3; i++) {
    const hasil = await c.masuk({ email: DEWI.email, password: 'salah', ip }, COOKIES);
    assert.equal(hasil.kode, 401);
    assert.equal(hasil.pesan, PESAN_LOGIN.salah);
  }

  // Percobaan ke-4 ditolak oleh pembatas laju IP
  const hasil4 = await c.masuk({ email: DEWI.email, password: 'benar', ip }, COOKIES);
  assert.equal(hasil4.kode, 429);
  assert.equal(hasil4.pesan, PESAN_LOGIN.terlaluBanyak);

  // IP lain tetap dapat mencoba
  const hasilIpLain = await c.masuk({ email: DEWI.email, password: 'benar', ip: '192.168.1.20' }, COOKIES);
  assert.equal(hasilIpLain.kode, 200);

  // Setelah jendela waktu berlalu (60 detik), IP pertama dapat mencoba kembali
  waktu += 60_001;
  const hasilPulih = await c.masuk({ email: DEWI.email, password: 'benar', ip }, COOKIES);
  assert.equal(hasilPulih.kode, 200);
});

function sesiIdle() {
  let t = 0;
  const keluar: string[] = [];
  const adapter: AdapterSesi = {
    async masuk() { return DEWI; },
    async baca() { return keluar.length ? null : DEWI; },
    async keluar() { keluar.push('token-1'); },
    kunci() { return keluar.length ? null : 'token-1'; },
  };
  const c = new AutentikasiController(adapter, { batasIdleMs: 60_000, now: () => t });
  return { c, keluar, maju: (ms: number) => { t += ms; } };
}

test('nfr_12 sesi tetap aktif selama ada aktivitas sebelum batas idle', async () => {
  const { c, maju } = sesiIdle();
  await c.masuk({ email: DEWI.email, password: 'x' }, COOKIES);
  assert.deepEqual(await c.sesiAktif(COOKIES), DEWI);
  for (let i = 0; i < 5; i++) {
    maju(50_000);
    assert.deepEqual(await c.sesiAktif(COOKIES), DEWI);
  }
});

test('nfr_12 sesi yang idle melewati batas dihapus di server', async () => {
  const { c, keluar, maju } = sesiIdle();
  await c.masuk({ email: DEWI.email, password: 'x' }, COOKIES);
  maju(60_001);
  assert.equal(await c.sesiAktif(COOKIES), null);
  assert.deepEqual(keluar, ['token-1']);
  assert.equal(c.aktivitas.size, 0);
});

test('nfr_12 sesi tanpa catatan aktivitas dianggap kedaluwarsa', async () => {
  const { c, keluar } = sesiIdle();
  assert.equal(await c.sesiAktif(COOKIES), null);
  assert.deepEqual(keluar, ['token-1']);
});

test('t_f3_3_02 logout menghapus sesi dan catatan aktivitasnya', async () => {
  const { c, keluar } = sesiIdle();
  await c.masuk({ email: DEWI.email, password: 'x' }, COOKIES);
  await c.keluar(COOKIES);
  assert.deepEqual(keluar, ['token-1']);
  assert.equal(c.aktivitas.size, 0);
  assert.equal(await c.sesiAktif(COOKIES), null);
});

test('nfr_12 batas idle bawaan 30 menit', () => {
  assert.equal(new AutentikasiController(sesiIdle().c.adapter).batasIdleMs, 30 * 60 * 1000);
});
