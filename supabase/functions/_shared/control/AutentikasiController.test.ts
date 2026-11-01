import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AutentikasiEdgeController,
  PESAN_AKSES_DIKUNCI,
  PESAN_FIELD_KOSONG,
  PESAN_KREDENSIAL_SALAH,
  PESAN_LOGIN_BERHASIL,
  type DataPetugas,
  type PenyimpananPetugas,
} from './AutentikasiController.ts';

const SEKARANG = new Date('2026-11-02T10:00:00.000Z');
const PETUGAS_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

// Penyimpanan tiruan yang meniru perilaku RPC: penghitung dan kunci diubah satu langkah (atomik).
function buatPenyimpanan(awal: Partial<DataPetugas & { gagal: number }> = {}) {
  const baris = {
    id: PETUGAS_ID,
    nama: 'Siti',
    gagal: awal.gagal ?? 0,
    terkunci_sampai: (awal.terkunci_sampai ?? null) as string | null,
  };
  const panggilan = { catat: 0, reset: 0 };
  const p: PenyimpananPetugas = {
    async dapatkanUserByEmail(email) {
      if (email !== 'siti@bpom.go.id') return null;
      return { petugasData: { id: baris.id, nama: baris.nama, terkunci_sampai: baris.terkunci_sampai } };
    },
    async catatGagalLogin() {
      panggilan.catat++;
      baris.gagal += 1;
      if (baris.gagal >= 3) baris.terkunci_sampai = new Date(SEKARANG.getTime() + 15 * 60_000).toISOString();
      return { gagalLogin: baris.gagal, terkunciSampai: baris.terkunci_sampai };
    },
    async resetGagalLogin() {
      panggilan.reset++;
      if (baris.terkunci_sampai && SEKARANG < new Date(baris.terkunci_sampai)) return false;
      baris.gagal = 0;
      baris.terkunci_sampai = null;
      return true;
    },
  };
  return { p, baris, panggilan };
}

function buatKontrol(p: PenyimpananPetugas, passwordBenar = 'rahasia123') {
  const auth = {
    async masukDenganPassword(_e: string, k: string) {
      return k === passwordBenar ? { sesi: { token: 'abc' }, galat: null } : { sesi: null, galat: new Error('invalid') };
    },
  };
  return new AutentikasiEdgeController(p, auth, () => SEKARANG);
}

test('req_3_1 isian kosong ditolak sebelum kredensial diperiksa', async () => {
  const { p, panggilan } = buatPenyimpanan();
  const hasil = await buatKontrol(p).masuk('', 'x');
  assert.deepEqual(hasil, { sukses: false, pesan: PESAN_FIELD_KOSONG });
  assert.equal(panggilan.catat, 0);
});

test('req_3_5 email tidak terdaftar dan password salah memberi pesan yang sama', async () => {
  const { p } = buatPenyimpanan();
  const c = buatKontrol(p);
  const a = await c.masuk('tidak@ada.id', 'rahasia123');
  const b = await c.masuk('siti@bpom.go.id', 'salah');
  assert.equal(a.pesan, PESAN_KREDENSIAL_SALAH);
  assert.equal(b.pesan, PESAN_KREDENSIAL_SALAH);
});

test('req_3_5 kegagalan ketiga mengunci akun dan menampilkan pesan terkunci', async () => {
  const { p, baris } = buatPenyimpanan();
  const c = buatKontrol(p);
  assert.equal((await c.masuk('siti@bpom.go.id', 'salah')).pesan, PESAN_KREDENSIAL_SALAH);
  assert.equal((await c.masuk('siti@bpom.go.id', 'salah')).pesan, PESAN_KREDENSIAL_SALAH);
  assert.equal((await c.masuk('siti@bpom.go.id', 'salah')).pesan, PESAN_AKSES_DIKUNCI);
  assert.ok(baris.terkunci_sampai);
});

test('nfr_11 akun terkunci ditolak walau password benar dan password tidak diperiksa', async () => {
  const { p, panggilan } = buatPenyimpanan({
    gagal: 3,
    terkunci_sampai: new Date(SEKARANG.getTime() + 60_000).toISOString(),
  });
  let dipanggil = 0;
  const c = new AutentikasiEdgeController(
    p,
    { async masukDenganPassword() { dipanggil++; return { sesi: {}, galat: null }; } },
    () => SEKARANG,
  );
  const hasil = await c.masuk('siti@bpom.go.id', 'rahasia123');
  assert.deepEqual(hasil, { sukses: false, pesan: PESAN_AKSES_DIKUNCI });
  assert.equal(dipanggil, 0);
  assert.equal(panggilan.catat, 0);
});

test('nfr_11 login benar diterima setelah kunci lewat dan penghitung direset', async () => {
  const { p, baris } = buatPenyimpanan({
    gagal: 3,
    terkunci_sampai: new Date(SEKARANG.getTime() - 1000).toISOString(),
  });
  const hasil = await buatKontrol(p).masuk('siti@bpom.go.id', 'rahasia123');
  assert.equal(hasil.sukses, true);
  assert.equal(hasil.pesan, PESAN_LOGIN_BERHASIL);
  assert.equal(baris.gagal, 0);
  assert.equal(baris.terkunci_sampai, null);
});

test('nfr_11 password benar ditolak bila reset menandai akun terkunci oleh percobaan paralel', async () => {
  const { p } = buatPenyimpanan();
  p.resetGagalLogin = async () => false;
  const hasil = await buatKontrol(p).masuk('siti@bpom.go.id', 'rahasia123');
  assert.deepEqual(hasil, { sukses: false, pesan: PESAN_AKSES_DIKUNCI });
});

test('nfr_11 percobaan paralel yang salah tetap terhitung semua dan mengunci akun', async () => {
  const { p, baris, panggilan } = buatPenyimpanan();
  const c = buatKontrol(p);
  await Promise.all(Array.from({ length: 5 }, () => c.masuk('siti@bpom.go.id', 'salah')));
  assert.equal(panggilan.catat, 5);
  assert.equal(baris.gagal, 5);
  assert.ok(baris.terkunci_sampai);
});
