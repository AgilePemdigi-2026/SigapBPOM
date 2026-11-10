import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANJANG_MAKS_RINGKASAN, PANJANG_MAKS_TEKS_UCAPAN, TranskripController, type PenyimpananTranskrip } from './TranskripController.ts';
import type { LogTool } from './InformasiProdukController.ts';

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function siapkan() {
  const ucapan: Parameters<PenyimpananTranskrip['catatUcapan']>[0][] = [];
  const log: LogTool[] = [];
  const ringkasan: Parameters<PenyimpananTranskrip['simpanRingkasan']>[0][] = [];
  const p: PenyimpananTranskrip = {
    async catatUcapan(d) { ucapan.push(d); return ucapan.length; },
    async catatLogTool(l) { log.push(l); },
    async simpanRingkasan(d) { ringkasan.push(d); },
  };
  return { c: new TranskripController(p), ucapan, log, ringkasan };
}

test('nfr_20 ucapan penelepon dan jawaban sistem diteruskan berurutan dengan teks dirapikan', async () => {
  const { c, ucapan } = siapkan();
  assert.deepEqual(await c.simpanUcapan({ percakapanId: ID, pembicara: 'sistem', teks: ' Silakan sebutkan nama produk atau pertanyaan Anda. ' }), { urutan: 1 });
  assert.deepEqual(await c.simpanUcapan({ percakapanId: ID.toUpperCase(), pembicara: 'penelepon', teks: 'Susu Formula Sehat' }), { urutan: 2 });
  assert.deepEqual(ucapan, [
    { percakapanId: ID, pembicara: 'sistem', teks: 'Silakan sebutkan nama produk atau pertanyaan Anda.' },
    { percakapanId: ID, pembicara: 'penelepon', teks: 'Susu Formula Sehat' },
  ]);
});

test('nfr_13 nomor telepon pada ucapan disamarkan sebelum disimpan dan bidang lain diabaikan', async () => {
  const { c, ucapan } = siapkan();
  await c.simpanUcapan({ percakapanId: ID, pembicara: 'penelepon', teks: 'Nomor saya 0812 3456 7890', nomorTelepon: '081234567890' });
  assert.deepEqual(ucapan, [{ percakapanId: ID, pembicara: 'penelepon', teks: 'Nomor saya 0812****7890' }]);
});

test('nfr_20 ucapan tidak valid ditolak dengan 422 tanpa menyimpan', async () => {
  const { c, ucapan } = siapkan();
  for (const masuk of [
    { percakapanId: 'bukan-uuid', pembicara: 'penelepon', teks: 'halo' },
    { percakapanId: ID, pembicara: 'petugas', teks: 'halo' },
    { percakapanId: ID, teks: 'halo' },
    { percakapanId: ID, pembicara: 'penelepon', teks: '   ' },
    { percakapanId: ID, pembicara: 'penelepon', teks: 42 },
    { percakapanId: ID, pembicara: 'penelepon', teks: 'a'.repeat(PANJANG_MAKS_TEKS_UCAPAN + 1) },
  ]) {
    await assert.rejects(() => c.simpanUcapan(masuk), (e: { status?: number }) => e.status === 422);
  }
  assert.equal(ucapan.length, 0);
});

test('t_f5_4_01 pemanggilan tool gateway tercatat hanya dengan nama, durasi, dan berhasil tidaknya', async () => {
  const { c, log } = siapkan();
  assert.deepEqual(await c.catatPemanggilanTool({ percakapanId: ID, namaTool: 'cek_registrasi_bpom', durasiMs: 812.4, berhasil: true }), { tersimpan: true });
  await c.catatPemanggilanTool({ percakapanId: ID, namaTool: 'cari_basis_pengetahuan', durasiMs: 0, berhasil: false, pertanyaan: 'rahasia', hasil: [1] });
  assert.deepEqual(log, [
    { percakapanId: ID, namaTool: 'cek_registrasi_bpom', durasiMs: 812, berhasil: true },
    { percakapanId: ID, namaTool: 'cari_basis_pengetahuan', durasiMs: 0, berhasil: false },
  ]);
});

test('t_f5_4_01 pemanggilan tool tidak valid ditolak dengan 422 tanpa menyimpan', async () => {
  const { c, log } = siapkan();
  for (const masuk of [
    { percakapanId: 'bukan-uuid', namaTool: 'cek_registrasi_bpom', durasiMs: 10, berhasil: true },
    { percakapanId: ID, namaTool: 'terbitkan_tiket_eskalasi', durasiMs: 10, berhasil: true },
    { percakapanId: ID, namaTool: 'cek_registrasi_bpom', durasiMs: -1, berhasil: true },
    { percakapanId: ID, namaTool: 'cek_registrasi_bpom', durasiMs: Number.POSITIVE_INFINITY, berhasil: true },
    { percakapanId: ID, namaTool: 'cek_registrasi_bpom', durasiMs: 11 * 60_000, berhasil: true },
    { percakapanId: ID, namaTool: 'cek_registrasi_bpom', durasiMs: '10', berhasil: true },
    { percakapanId: ID, namaTool: 'cek_registrasi_bpom', durasiMs: 10, berhasil: 'ya' },
  ]) {
    await assert.rejects(() => c.catatPemanggilanTool(masuk), (e: { status?: number }) => e.status === 422);
  }
  assert.equal(log.length, 0);
});

test('req_5_2 ringkasan dirapikan, nomor telepon disamarkan, dan ringkasan tidak sah ditolak 422', async () => {
  const { c, ringkasan } = siapkan();
  assert.deepEqual(
    await c.simpanRingkasan({ percakapanId: ID, ringkasan: '  Penelepon mengadukan Krim X.\n Nomor 081234567890 dicatat. ' }),
    { tersimpan: true },
  );
  assert.equal(ringkasan.length, 1);
  assert.equal(ringkasan[0].percakapanId, ID);
  assert.doesNotMatch(ringkasan[0].ringkasan, /081234567890/);
  assert.match(ringkasan[0].ringkasan, /^Penelepon mengadukan Krim X\. Nomor 0812\*+7890 dicatat\.$/);
  for (const r of ['', '   ', 'a'.repeat(PANJANG_MAKS_RINGKASAN + 1), 12]) {
    await assert.rejects(() => c.simpanRingkasan({ percakapanId: ID, ringkasan: r }), (e: { status?: number }) => e.status === 422);
  }
  await assert.rejects(() => c.simpanRingkasan({ percakapanId: 'bukan-uuid', ringkasan: 'Ringkasan.' }), (e: { status?: number }) => e.status === 422);
  assert.equal(ringkasan.length, 1);
});
