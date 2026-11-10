// Berawalan "_" agar Astro tidak menjadikannya route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST as telaah } from './telaah.ts';
import { POST as jadwal } from './jadwal.ts';
import { POST as tanggapan } from './tanggapan.ts';
import { POST as tutup } from './tutup.ts';
import { pilihPenyimpananPenanganan, simpanTelaah, tutupTiket } from '../../../../lib/penanganan.ts';
import { PenangananController, PenyimpananPenangananMock, PenyimpananPenangananSupabase } from '../../../../lib/PenangananController.ts';

process.env.SUPABASE_URL = 'http://supabase.uji';
process.env.SUPABASE_ANON_KEY = 'anon-uji';

const TIKET = 'ADU-20261104-0001';
type Rute = typeof telaah;
type Opsi = { tiket?: string; body?: unknown; tokenAkses?: string; jawaban?: Response };

function kirim(rute: Rute, opsi: Opsi = {}) {
  const panggilan: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    panggilan.push({ url, init });
    return opsi.jawaban ?? Response.json(null);
  }) as unknown as typeof fetch;
  const body = typeof opsi.body === 'string' ? opsi.body : JSON.stringify(opsi.body ?? {});
  const request = new Request('http://sigap.uji/api/pengaduan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const tokenAkses = 'tokenAkses' in opsi ? opsi.tokenAkses : 'token-petugas';
  const ctx = { params: { tiket: opsi.tiket ?? TIKET }, request, locals: { tokenAkses } } as unknown as Parameters<Rute>[0];
  return { hasil: rute(ctx) as Promise<Response>, panggilan };
}

// simpan_telaah mengembalikan jsonb (migrasi 20261105130000).
const jawabanTelaah = (status: string, tindakLanjut: string, pesan: string) => ({ id: 't-1', tiket_id: 'u-1', no_tiket: TIKET, status, tindak_lanjut: tindakLanjut, pesan });

function periksaRpc(panggilan: { url: string; init: RequestInit }[], nama: string, argumen: Record<string, string>) {
  assert.equal(panggilan.length, 1);
  assert.equal(panggilan[0].url, `http://supabase.uji/rest/v1/rpc/${nama}`);
  assert.equal(panggilan[0].init.method, 'POST');
  const header = panggilan[0].init.headers as Record<string, string>;
  assert.equal(header.Authorization, 'Bearer token-petugas');
  assert.equal(header.apikey, 'anon-uji');
  assert.deepEqual(JSON.parse(panggilan[0].init.body as string), argumen);
}

test('req_6_2 simpan telaah memanggil rpc simpan_telaah dengan token petugas', async () => {
  const body = { tindakLanjut: 'Telaah Dokumen', catatan: ' Label produk tidak mencantumkan nomor izin edar. ' };
  const { hasil, panggilan } = kirim(telaah, { body, jawaban: Response.json(jawabanTelaah('sedang_ditelaah', 'telaah_dokumen', 'Hasil telaah tersimpan.')) });
  const res = await hasil;
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    status: 'success',
    message: 'Hasil telaah tersimpan.',
    data: { noTiket: TIKET, status: 'sedang_ditelaah', labelStatus: 'Sedang Ditelaah' },
  });
  periksaRpc(panggilan, 'simpan_telaah', { p_no_tiket: TIKET, p_tindak_lanjut: 'Telaah Dokumen', p_catatan: 'Label produk tidak mencantumkan nomor izin edar.' });
});

test('br_3 telaah Bukan Kewenangan BPOM meneruskan pengaduan; catatan boleh kosong', async () => {
  const { hasil, panggilan } = kirim(telaah, { body: { tindakLanjut: 'Bukan Kewenangan BPOM' }, jawaban: Response.json(jawabanTelaah('diteruskan', 'bukan_kewenangan', 'Pengaduan diteruskan ke instansi lain.')) });
  assert.deepEqual(await (await hasil).json(), {
    status: 'success',
    message: 'Pengaduan diteruskan ke instansi lain.',
    data: { noTiket: TIKET, status: 'diteruskan', labelStatus: 'Diteruskan ke Instansi Lain' },
  });
  periksaRpc(panggilan, 'simpan_telaah', { p_no_tiket: TIKET, p_tindak_lanjut: 'Bukan Kewenangan BPOM', p_catatan: null });
});

test('req_6_3 simpan jadwal memanggil rpc simpan_jadwal_pemeriksaan dengan token petugas', async () => {
  const body = { tanggal: '2026-10-15', unit: 'Balai Besar POM di Surabaya' };
  const { hasil, panggilan } = kirim(jadwal, { body, jawaban: Response.json({ id: 'j-1', no_tiket: TIKET, status: 'menunggu_pemeriksaan', tanggal: '2026-10-15', unit_pelaksana: body.unit, pesan: 'Jadwal pemeriksaan tersimpan.' }) });
  const res = await hasil;
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    status: 'success',
    message: 'Jadwal pemeriksaan tersimpan.',
    data: { noTiket: TIKET, status: 'menunggu_pemeriksaan', labelStatus: 'Menunggu Pemeriksaan' },
  });
  periksaRpc(panggilan, 'simpan_jadwal_pemeriksaan', { p_no_tiket: TIKET, p_tanggal: '2026-10-15', p_unit: 'Balai Besar POM di Surabaya' });
});

test('req_6_4 simpan tanggapan memanggil rpc simpan_tanggapan dengan token petugas', async () => {
  const isi = 'Produk telah ditelaah dan pelaku usaha diberi peringatan tertulis.';
  const { hasil, panggilan } = kirim(tanggapan, { body: { isi }, jawaban: Response.json('tanggapan_disusun') });
  const res = await hasil;
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    status: 'success',
    message: 'Tanggapan tersimpan.',
    data: { noTiket: TIKET, status: 'tanggapan_disusun', labelStatus: 'Tanggapan Disusun' },
  });
  periksaRpc(panggilan, 'simpan_tanggapan', { p_no_tiket: TIKET, p_isi: isi });
});

test('req_6_6 tutup tiket memanggil rpc tutup_tiket dengan token petugas', async () => {
  const { hasil, panggilan } = kirim(tutup, { jawaban: Response.json('selesai') });
  const res = await hasil;
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'success', message: 'Tiket ditutup.', data: { noTiket: TIKET, status: 'selesai', labelStatus: 'Selesai' } });
  periksaRpc(panggilan, 'tutup_tiket', { p_no_tiket: TIKET });
});

test('req_6_5 br_2 galat tutup tiket tanpa tanggapan menjadi pesan kamus', async () => {
  const jawaban = Response.json({ code: 'SGBR2', message: 'tiket belum punya tanggapan', details: null, hint: null }, { status: 400 });
  const res = await kirim(tutup, { jawaban }).hasil;
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { status: 'error', message: 'Tiket tidak dapat ditutup. Susun tanggapan terlebih dahulu.', data: null });
});

test('req_6_2 galat rpc lain dipetakan ke kode HTTP; rpc yang belum dimigrasikan bukan "tiket tidak ditemukan"', async () => {
  const kasus: [Response, number, string][] = [
    [Response.json({ code: 'P0002', message: 'Tiket tidak ditemukan' }, { status: 400 }), 404, 'Tiket tidak ditemukan.'],
    [Response.json({ code: '55000', message: 'Tiket sudah diteruskan' }, { status: 400 }), 422, 'Permintaan tidak valid.'],
    [Response.json({ code: 'SG409', message: 'transisi tidak sah' }, { status: 400 }), 422, 'Permintaan tidak valid.'],
    [Response.json({ code: '42501', message: 'Akses ditolak' }, { status: 403 }), 403, 'Akses ditolak.'],
    [Response.json({ code: 'PGRST202', message: 'Could not find the function' }, { status: 404 }), 500, 'Terjadi kesalahan pada sistem.'],
    [new Response('<html>Bad Gateway</html>', { status: 502 }), 500, 'Terjadi kesalahan pada sistem.'],
  ];
  for (const [jawaban, kode, message] of kasus) {
    const res = await kirim(telaah, { body: { tindakLanjut: 'Telaah Dokumen', catatan: 'x' }, jawaban }).hasil;
    assert.equal(res.status, kode, message);
    assert.deepEqual(await res.json(), { status: 'error', message, data: null });
  }
});

test('req_6_1 input tidak sah ditolak 400 tanpa memanggil Supabase', async () => {
  const kasus: [Rute, Opsi][] = [
    [telaah, { tiket: 'ADU-1', body: { tindakLanjut: 'Telaah Dokumen' } }],
    [telaah, { body: { tindakLanjut: 'telaah_dokumen' } }],
    [telaah, { body: { tindakLanjut: 'tutup' } }],
    [telaah, { body: {} }],
    [telaah, { body: { tindakLanjut: 'Telaah Dokumen', catatan: 5 } }],
    [telaah, { body: { tindakLanjut: 'Telaah Dokumen', catatan: 'x'.repeat(2001) } }],
    [telaah, { body: 'bukan json' }],
    [jadwal, { body: { tanggal: '15-10-2026', unit: 'Balai Besar POM di Surabaya' } }],
    [jadwal, { body: { tanggal: '2026-02-30', unit: 'Balai Besar POM di Surabaya' } }],
    [jadwal, { body: { tanggal: '2026-10-15', unit: '   ' } }],
    [jadwal, { body: { tanggal: '2026-10-15' } }],
    [jadwal, { body: { tanggal: '2026-10-15', unit: 'x'.repeat(201) } }],
    [tanggapan, { body: { isi: '   ' } }],
    [tanggapan, { body: { isi: 'x'.repeat(5001) } }],
    [tutup, { tiket: "ADU-20261104-0001' or 1=1" }],
  ];
  for (const [rute, opsi] of kasus) {
    const { hasil, panggilan } = kirim(rute, opsi);
    const res = await hasil;
    assert.equal(res.status, 400, JSON.stringify(opsi));
    assert.deepEqual(await res.json(), { status: 'error', message: 'Permintaan tidak valid.', data: null });
    assert.equal(panggilan.length, 0);
  }
});

test('t_f7_2_03 penyimpanan tiruan hanya tanpa token di luar produksi, dan tutup tanpa tanggapan tetap memakai pesan kamus', async () => {
  const env = { SUPABASE_URL: 'http://supabase.uji', SUPABASE_ANON_KEY: 'anon-uji' };
  assert.ok(pilihPenyimpananPenanganan(undefined, env, false) instanceof PenyimpananPenangananMock);
  assert.ok(pilihPenyimpananPenanganan('token-petugas', env, false) instanceof PenyimpananPenangananSupabase);
  assert.ok(pilihPenyimpananPenanganan(undefined, env, true) instanceof PenyimpananPenangananSupabase);

  const lokal = new PenangananController(new PenyimpananPenangananMock());
  assert.deepEqual(await tutupTiket(lokal, 'ADU-20261104-0010'), { kode: 422, pesan: 'Tiket tidak dapat ditutup. Susun tanggapan terlebih dahulu.', data: null });
  assert.equal((await simpanTelaah(lokal, 'ADU-20261104-0010', 'Telaah Dokumen', '')).kode, 200);
});
