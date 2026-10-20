import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdapterCekBpomTiruan, type AdapterCekBpom } from '../adapter/cekbpom.ts';
import { normalkanNomorTelepon } from '../entity/penelepon.ts';
import { ErrorSigap, InformasiProdukController, PESAN_MINTA_NOMOR_TELEPON, type LogTool, type PenyimpananLayanan } from './InformasiProdukController.ts';

const PERCAKAPAN = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function penyimpananTiruan() {
  const log: LogTool[] = [];
  const tiket: { percakapanId: string; nomorTelepon: string; ringkasan: string }[] = [];
  const p: PenyimpananLayanan = {
    async catatLogTool(l) { log.push(l); },
    async terbitkanTiketEskalasi(d) { tiket.push(d); return 'ESK-20261020-0001'; },
  };
  return { p, log, tiket };
}

const buat = (adapter: AdapterCekBpom = new AdapterCekBpomTiruan(), batasMs?: number) => {
  const s = penyimpananTiruan();
  return { ...s, c: new InformasiProdukController(adapter, s.p, batasMs) };
};

test('req_1_3 Susu Formula Sehat mengembalikan satu hasil berstatus Berlaku', async () => {
  const { c, log } = buat();
  const { hasil } = await c.cekRegistrasi({ namaProduk: 'Susu Formula Sehat', percakapanId: PERCAKAPAN });
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].nomorIzinEdar, 'BPOM RI MD 865009001234');
  assert.equal(hasil[0].status, 'Berlaku');
  assert.deepEqual(log.map((l) => [l.namaTool, l.berhasil, l.percakapanId]), [['cek_registrasi_bpom', true, PERCAKAPAN]]);
});

test('req_1_5 hasil ganda dikembalikan seluruhnya agar agen bisa menyebut jumlahnya', async () => {
  const { c } = buat();
  const { hasil } = await c.cekRegistrasi({ namaProduk: 'paracetamol' });
  assert.equal(hasil.length, 4);
});

test('nfr_7 nama acak mengembalikan array kosong, bukan status karangan', async () => {
  const { c } = buat();
  assert.deepEqual(await c.cekRegistrasi({ namaProduk: 'Produk Xyz Tidak Ada' }), { hasil: [] });
});

test('nfr_2 adapter yang melewati batas waktu menghasilkan error terkendali dan tercatat gagal', async () => {
  const lambat: AdapterCekBpom = { cari: () => new Promise(() => {}) };
  const { c, log } = buat(lambat, 20);
  await assert.rejects(c.cekRegistrasi({ namaProduk: 'Susu' }), (e) => e instanceof ErrorSigap && e.status === 504);
  assert.equal(log[0].berhasil, false);
});

test('nfr_7 gangguan adapter menjadi error 502, bukan hasil', async () => {
  const rusak: AdapterCekBpom = { cari: async () => { throw new Error('jaringan'); } };
  const { c } = buat(rusak);
  await assert.rejects(c.cekRegistrasi({ namaProduk: 'Susu' }), (e) => e instanceof ErrorSigap && e.status === 502);
});

test('cek registrasi menolak nama kosong dan percakapanId bukan uuid', async () => {
  const { c } = buat();
  await assert.rejects(c.cekRegistrasi({ namaProduk: '  ' }), (e) => e instanceof ErrorSigap && e.status === 422);
  await assert.rejects(c.cekRegistrasi({ namaProduk: 'Susu', percakapanId: 'x' }), (e) => e instanceof ErrorSigap && e.status === 422);
});

test('req_1_7 nomor valid menerbitkan tiket ESK dengan nomor yang dinormalkan', async () => {
  const { c, tiket, log } = buat();
  const hasil = await c.terbitkanTiketEskalasi({ percakapanId: PERCAKAPAN, nomorTelepon: '+62 812-3456-7890', pertanyaan: 'Apakah obat batuk ini aman untuk ibu hamil?' });
  assert.deepEqual(hasil, { nomorTiket: 'ESK-20261020-0001' });
  assert.equal(tiket[0].nomorTelepon, '081234567890');
  assert.equal(log[0].namaTool, 'terbitkan_tiket_eskalasi');
});

test('req_1_7 nomor tidak valid ditolak dengan pesan minta ulang dan tidak menerbitkan tiket', async () => {
  const { c, tiket } = buat();
  await assert.rejects(
    c.terbitkanTiketEskalasi({ percakapanId: PERCAKAPAN, nomorTelepon: '12345', pertanyaan: 'Aman untuk ibu hamil?' }),
    (e) => e instanceof ErrorSigap && e.status === 422 && e.message === PESAN_MINTA_NOMOR_TELEPON,
  );
  assert.equal(tiket.length, 0);
});

test('nomor telepon format Indonesia: 08… atau +628…, 10–13 digit', () => {
  assert.equal(normalkanNomorTelepon('0812345678'), '0812345678');
  assert.equal(normalkanNomorTelepon('0812345678901'), '0812345678901');
  assert.equal(normalkanNomorTelepon('+6281234567890'), '081234567890');
  assert.equal(normalkanNomorTelepon('081234567'), null);
  assert.equal(normalkanNomorTelepon('08123456789012'), null);
  assert.equal(normalkanNomorTelepon('0212345678'), null);
});
