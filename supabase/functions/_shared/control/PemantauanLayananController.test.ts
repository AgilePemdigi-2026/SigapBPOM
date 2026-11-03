import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PemantauanLayananController, type PenyimpananPemantauan } from './PemantauanLayananController.ts';

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function siapkan() {
  const laporan: Parameters<PenyimpananPemantauan['laporkanPanggilanAktif']>[0][] = [];
  const ditutup: string[] = [];
  const p: PenyimpananPemantauan = {
    async laporkanPanggilanAktif(d) { laporan.push(d); },
    async akhiriPanggilanAktif(id) { ditutup.push(id); return true; },
  };
  return { c: new PemantauanLayananController(p), laporan, ditutup };
}

test('req_4_2 laporan panggilan aktif diteruskan dengan tahap dan jenis layanan valid', async () => {
  const { c, laporan } = siapkan();
  const r = await c.laporkanPanggilanAktif({ percakapanId: ID, jenisLayanan: 'pengaduan', topik: '  Pengaduan produk ', tahap: 'memproses' });
  assert.deepEqual(r, { tersimpan: true });
  assert.deepEqual(laporan, [{ percakapanId: ID, jenisLayanan: 'pengaduan', topik: 'Pengaduan produk', tahap: 'memproses' }]);
});

test('req_4_2 laporan hanya berisi heartbeat bila tahap, layanan, dan topik tidak diisi', async () => {
  const { c, laporan } = siapkan();
  await c.laporkanPanggilanAktif({ percakapanId: ID });
  assert.deepEqual(laporan, [{ percakapanId: ID, jenisLayanan: null, topik: null, tahap: null }]);
});

test('req_4_2 aksi akhiri menutup panggilan', async () => {
  const { c, ditutup } = siapkan();
  assert.deepEqual(await c.akhiriPanggilanAktif({ percakapanId: ID }), { ditutup: true });
  assert.deepEqual(ditutup, [ID]);
});

test('req_4_2 masukan tidak valid ditolak dengan 422', async () => {
  const { c, laporan, ditutup } = siapkan();
  for (const masuk of [
    { percakapanId: 'bukan-uuid' },
    { percakapanId: ID, tahap: 'tidur' },
    { percakapanId: ID, jenisLayanan: 'lain' },
    { percakapanId: ID, topik: 42 },
  ]) {
    await assert.rejects(() => c.laporkanPanggilanAktif(masuk), (e: { status?: number }) => e.status === 422);
  }
  await assert.rejects(() => c.akhiriPanggilanAktif({ percakapanId: 'bukan-uuid' }), (e: { status?: number }) => e.status === 422);
  assert.equal(laporan.length, 0);
  assert.equal(ditutup.length, 0);
});

test('nfr_privasi topik dipotong dan bidang lain seperti nomor telepon atau transkrip diabaikan', async () => {
  const { c, laporan } = siapkan();
  await c.laporkanPanggilanAktif({ percakapanId: ID, topik: 'x'.repeat(500), nomorTelepon: '081234567890', transkrip: 'rahasia' });
  assert.equal(laporan[0].topik?.length, 80);
  assert.deepEqual(Object.keys(laporan[0]).sort(), ['jenisLayanan', 'percakapanId', 'tahap', 'topik']);
});
