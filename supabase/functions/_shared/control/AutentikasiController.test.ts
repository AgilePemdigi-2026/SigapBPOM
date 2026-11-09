import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AutentikasiEdgeController,
  BATAS_GAGAL_LOGIN,
  PESAN_AKSES_DIKUNCI,
  PESAN_FIELD_KOSONG,
  PESAN_KREDENSIAL_SALAH,
  PESAN_LOGIN_BERHASIL,
  type Autentikator,
  type PenyimpananPetugas,
} from './AutentikasiController.ts';
import { ErrorSigap } from './InformasiProdukController.ts';

const SEKARANG = new Date('2026-11-02T10:00:00.000Z');
const PETUGAS_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const DURASI_KUNCI_MS = 15 * 60_000;

// Penyimpanan tiruan yang meniru RPC reservasi_percobaan_login, reset_gagal_login, dan kembalikan_percobaan_login:
// satu langkah (atomik).
function buatPenyimpanan(awal: { gagal?: number; terkunci_sampai?: string | null } = {}) {
  const baris = {
    id: PETUGAS_ID,
    nama: 'Siti',
    gagal: awal.gagal ?? 0,
    terkunci_sampai: awal.terkunci_sampai ?? null,
  };
  const panggilan = { reservasi: 0, reset: 0, kembalikan: 0, dicari: [] as string[] };
  const p: PenyimpananPetugas = {
    async dapatkanUserByEmail(email) {
      panggilan.dicari.push(email);
      if (email !== 'siti@bpom.go.id') return null;
      return { petugasData: { id: baris.id, nama: baris.nama } };
    },
    async reservasiPercobaan() {
      panggilan.reservasi++;
      const terkunci = baris.terkunci_sampai !== null;
      if (terkunci && SEKARANG < new Date(baris.terkunci_sampai!)) return null;
      const lanjut = !terkunci && baris.gagal < BATAS_GAGAL_LOGIN;
      baris.gagal = lanjut ? baris.gagal + 1 : 1;
      baris.terkunci_sampai =
        baris.gagal === BATAS_GAGAL_LOGIN ? new Date(SEKARANG.getTime() + DURASI_KUNCI_MS).toISOString() : null;
      return baris.gagal;
    },
    async resetGagalLogin() {
      panggilan.reset++;
      baris.gagal = 0;
      baris.terkunci_sampai = null;
    },
    async kembalikanPercobaan() {
      panggilan.kembalikan++;
      baris.gagal = Math.max(baris.gagal - 1, 0);
      baris.terkunci_sampai = null;
    },
  };
  return { p, baris, panggilan };
}

// Supabase Auth tiruan: password salah ditolak dengan status 400 seperti GoTrue.
function buatKontrol(p: PenyimpananPetugas, passwordBenar = 'rahasia123') {
  const cek = { password: 0, email: [] as string[] };
  const auth: Autentikator = {
    async masukDenganPassword(e: string, k: string) {
      cek.password++;
      cek.email.push(e);
      return k === passwordBenar ? { sesi: { token: 'abc' }, galat: null } : { sesi: null, galat: { status: 400 } };
    },
  };
  return { c: new AutentikasiEdgeController(p, auth), cek };
}

test('req_3_1 isian kosong ditolak sebelum kredensial diperiksa', async () => {
  const { p, panggilan } = buatPenyimpanan();
  const { c, cek } = buatKontrol(p);
  const hasil = await c.masuk('', 'x');
  assert.deepEqual(hasil, { sukses: false, pesan: PESAN_FIELD_KOSONG });
  assert.equal(panggilan.reservasi, 0);
  assert.equal(cek.password, 0);
});

test('req_3_5 email tidak terdaftar dan password salah memberi pesan yang sama', async () => {
  const { p } = buatPenyimpanan();
  const { c } = buatKontrol(p);
  const a = await c.masuk('tidak@ada.id', 'rahasia123');
  const b = await c.masuk('siti@bpom.go.id', 'salah');
  assert.equal(a.pesan, PESAN_KREDENSIAL_SALAH);
  assert.equal(b.pesan, PESAN_KREDENSIAL_SALAH);
});

test('req_3_5 kegagalan ketiga mengunci akun dan menampilkan pesan terkunci', async () => {
  const { p, baris } = buatPenyimpanan();
  const { c } = buatKontrol(p);
  assert.equal((await c.masuk('siti@bpom.go.id', 'salah')).pesan, PESAN_KREDENSIAL_SALAH);
  assert.equal((await c.masuk('siti@bpom.go.id', 'salah')).pesan, PESAN_KREDENSIAL_SALAH);
  assert.equal((await c.masuk('siti@bpom.go.id', 'salah')).pesan, PESAN_AKSES_DIKUNCI);
  assert.ok(baris.terkunci_sampai);
});

test('req_3_5 password benar pada percobaan ketiga diterima dan melepas kunci', async () => {
  const { p, baris } = buatPenyimpanan({ gagal: 2 });
  const { c } = buatKontrol(p);
  const hasil = await c.masuk('siti@bpom.go.id', 'rahasia123');
  assert.equal(hasil.sukses, true);
  assert.equal(baris.gagal, 0);
  assert.equal(baris.terkunci_sampai, null);
});

test('nfr_11 akun terkunci ditolak walau password benar dan password tidak diperiksa', async () => {
  const { p, panggilan } = buatPenyimpanan({
    gagal: 3,
    terkunci_sampai: new Date(SEKARANG.getTime() + 60_000).toISOString(),
  });
  const { c, cek } = buatKontrol(p);
  const hasil = await c.masuk('siti@bpom.go.id', 'rahasia123');
  assert.deepEqual(hasil, { sukses: false, pesan: PESAN_AKSES_DIKUNCI });
  assert.equal(cek.password, 0);
  assert.equal(panggilan.reset, 0);
});

test('nfr_11 login benar diterima setelah kunci lewat dan penghitung direset', async () => {
  const { p, baris } = buatPenyimpanan({
    gagal: 3,
    terkunci_sampai: new Date(SEKARANG.getTime() - 1000).toISOString(),
  });
  const { c } = buatKontrol(p);
  const hasil = await c.masuk('siti@bpom.go.id', 'rahasia123');
  assert.equal(hasil.sukses, true);
  assert.equal(hasil.pesan, PESAN_LOGIN_BERHASIL);
  assert.equal(baris.gagal, 0);
  assert.equal(baris.terkunci_sampai, null);
});

test('nfr_11 setelah kunci lewat satu kali salah tidak langsung mengunci lagi', async () => {
  const { p, baris } = buatPenyimpanan({
    gagal: 3,
    terkunci_sampai: new Date(SEKARANG.getTime() - 1000).toISOString(),
  });
  const { c } = buatKontrol(p);
  assert.equal((await c.masuk('siti@bpom.go.id', 'salah')).pesan, PESAN_KREDENSIAL_SALAH);
  assert.equal(baris.gagal, 1);
  assert.equal(baris.terkunci_sampai, null);
});

test('nfr_11 percobaan paralel paling banyak memeriksa tiga password lalu mengunci akun', async () => {
  const { p, baris } = buatPenyimpanan();
  const { c, cek } = buatKontrol(p);
  const hasil = await Promise.all(Array.from({ length: 5 }, () => c.masuk('siti@bpom.go.id', 'salah')));
  assert.equal(cek.password, BATAS_GAGAL_LOGIN);
  assert.ok(hasil.every((h) => !h.sukses));
  assert.equal(hasil.filter((h) => h.pesan === PESAN_AKSES_DIKUNCI).length, 3);
  assert.ok(baris.terkunci_sampai);
});

test('req_3_4 email huruf besar dan berspasi dinormalkan sebelum dicari dan diperiksa', async () => {
  const { p, panggilan } = buatPenyimpanan();
  const { c, cek } = buatKontrol(p);
  const hasil = await c.masuk('  SITI@BPOM.GO.ID ', 'rahasia123');
  assert.equal(hasil.sukses, true);
  assert.deepEqual(panggilan.dicari, ['siti@bpom.go.id']);
  assert.deepEqual(cek.email, ['siti@bpom.go.id']);
});

const galatSistem = (e: unknown) => e instanceof ErrorSigap && e.status === 503 && e.message === 'Terjadi kesalahan pada sistem.';

test('req_3_5 galat teknis Supabase Auth (429, 500, jaringan) tidak menambah gagal_login dan dibalas 503', async () => {
  const galatTeknis: Autentikator['masukDenganPassword'][] = [
    async () => ({ sesi: null, galat: { status: 429 } }),
    async () => ({ sesi: null, galat: { status: 500 } }),
    async () => ({ sesi: null, galat: { status: 0 } }),
    async () => ({ sesi: null, galat: {} }),
    async () => { throw new TypeError('fetch failed'); },
  ];
  const { p, baris, panggilan } = buatPenyimpanan();
  for (const [i, masukDenganPassword] of galatTeknis.entries()) {
    const c = new AutentikasiEdgeController(p, { masukDenganPassword });
    await assert.rejects(c.masuk('siti@bpom.go.id', 'rahasia123'), galatSistem);
    assert.equal(baris.gagal, 0);
    assert.equal(panggilan.kembalikan, i + 1);
  }
});

test('nfr_11 galat teknis pada percobaan ketiga tidak mengunci akun', async () => {
  const { p, baris } = buatPenyimpanan({ gagal: 2 });
  const c = new AutentikasiEdgeController(p, { masukDenganPassword: async () => ({ sesi: null, galat: { status: 503 } }) });
  await assert.rejects(c.masuk('siti@bpom.go.id', 'rahasia123'), galatSistem);
  assert.equal(baris.gagal, 2);
  assert.equal(baris.terkunci_sampai, null);
  assert.equal((await buatKontrol(p).c.masuk('siti@bpom.go.id', 'salah')).pesan, PESAN_AKSES_DIKUNCI);
});
