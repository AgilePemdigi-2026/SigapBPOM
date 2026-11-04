import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PenyimpananRiwayatSupabase } from './penyimpananRiwayatSupabase.ts';
import { PenyimpananRiwayatTiruan } from './mock/riwayatTiruan.ts';
import { pilihPenyimpananRiwayat } from './riwayatPercakapan.ts';
import { PESAN_RIWAYAT, TranskripController } from './TranskripController.ts';

const PERIODE = { dari: '2026-10-31T17:00:00.000Z', sampai: '2026-11-04T03:39:00.000Z' };

type Permintaan = { url: URL; method: string; headers: Record<string, string> };

/** fetch palsu: mencatat setiap permintaan dan menjawab lewat fungsi jawab. */
function fetchPalsu(jawab: (r: Permintaan) => Response) {
  const log: Permintaan[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const r = { url: new URL(String(input)), method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string> };
    log.push(r);
    return jawab(r);
  }) as typeof fetch;
  return { f, log };
}

const penyimpanan = (f: typeof fetch) => new PenyimpananRiwayatSupabase({ url: 'http://127.0.0.1:54321/', kunciPublik: 'kunci-anon', tokenAkses: 'token-petugas', fetch: f });

test('req_5_1 t_f6_1_02 daftar dibaca dari view riwayat_percakapan dengan token petugas, periode, dan tanpa percakapan berjalan', async () => {
  const { f, log } = fetchPalsu(() =>
    Response.json([
      { id: 'p-2', waktu_mulai: '2026-11-04T02:48:00Z', jenis_interaksi: 'informasi_produk', ringkasan: 'Obat batuk ibu hamil', status_penyelesaian: 'dieskalasi' },
    ]),
  );
  const baris = await penyimpanan(f).daftar({ periode: PERIODE, offset: 10, batas: 10 });

  assert.deepEqual(baris, [
    { id: 'p-2', waktuMulai: '2026-11-04T02:48:00Z', jenisInteraksi: 'informasi_produk', ringkasan: 'Obat batuk ibu hamil', statusPenyelesaian: 'dieskalasi' },
  ]);
  const [r] = log;
  assert.equal(r.url.origin + r.url.pathname, 'http://127.0.0.1:54321/rest/v1/riwayat_percakapan');
  assert.equal(r.headers.Authorization, 'Bearer token-petugas');
  assert.equal(r.headers.apikey, 'kunci-anon');
  const q = r.url.searchParams;
  assert.equal(q.get('select'), 'id,waktu_mulai,jenis_interaksi,ringkasan,status_penyelesaian');
  assert.equal(q.get('jenis_interaksi'), null);
  assert.deepEqual(q.getAll('waktu_mulai'), [`gte.${PERIODE.dari}`, `lt.${PERIODE.sampai}`]);
  assert.deepEqual(q.getAll('status_penyelesaian'), ['neq.berjalan']);
  assert.deepEqual([q.get('order'), q.get('offset'), q.get('limit')], ['waktu_mulai.desc,id.desc', '10', '10']);

  await penyimpanan(f).daftar({ periode: PERIODE, jenis: 'pengaduan', offset: 0, batas: 8 });
  assert.equal(log[1].url.searchParams.get('jenis_interaksi'), 'eq.pengaduan');
});

test('req_5_1 t_f6_1_02 kartu ringkasan dihitung dari view yang sama memakai count=exact per kategori', async () => {
  const JUMLAH: Record<string, number> = { semua: 1036, informasi_produk: 781, pengaduan: 176, dieskalasi: 79 };
  const { f, log } = fetchPalsu(({ url }) => {
    const q = url.searchParams;
    const kunci = q.get('jenis_interaksi')?.slice(3) ?? (q.getAll('status_penyelesaian').includes('eq.dieskalasi') ? 'dieskalasi' : 'semua');
    return new Response(null, { status: 200, headers: { 'Content-Range': `0-0/${JUMLAH[kunci]}` } });
  });

  assert.deepEqual(await penyimpanan(f).ringkasan(PERIODE), { total: 1036, informasiProduk: 781, pengaduanProduk: 176, dieskalasi: 79 });
  assert.equal(log.length, 4);
  for (const r of log) {
    assert.equal(r.method, 'HEAD');
    assert.equal(r.headers.Prefer, 'count=exact');
    assert.equal(r.headers.Authorization, 'Bearer token-petugas');
    assert.equal(r.url.pathname, '/rest/v1/riwayat_percakapan');
    assert.deepEqual(r.url.searchParams.getAll('waktu_mulai'), [`gte.${PERIODE.dari}`, `lt.${PERIODE.sampai}`]);
    assert.ok(r.url.searchParams.getAll('status_penyelesaian').includes('neq.berjalan'));
  }
});

test('req_5_1 halaman di luar jangkauan (416) berarti daftar kosong; galat lain ditolak dan tampil sebagai pesan kamus', async () => {
  assert.deepEqual(await penyimpanan(fetchPalsu(() => new Response(null, { status: 416 })).f).daftar({ periode: PERIODE, offset: 990, batas: 10 }), []);

  const ditolak = penyimpanan(fetchPalsu(() => Response.json({ message: 'permission denied for view riwayat_percakapan' }, { status: 401 })).f);
  await assert.rejects(ditolak.daftar({ periode: PERIODE, offset: 0, batas: 10 }), /Supabase 401/);
  assert.deepEqual(await new TranskripController(ditolak).ambilDaftarPercakapan(), { gagal: PESAN_RIWAYAT.gagalDimuat });

  const tanpaJumlah = penyimpanan(fetchPalsu(() => new Response(null, { status: 200 })).f);
  await assert.rejects(tanpaJumlah.ringkasan(PERIODE), /jumlah baris/);
});

test('req_5_1 t_f6_1_02 ada token petugas selalu memakai Supabase; data tiruan hanya tanpa token', () => {
  const ENV = { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: 'kunci-anon' };
  const supabase = pilihPenyimpananRiwayat('token-petugas', ENV);
  assert.ok(supabase instanceof PenyimpananRiwayatSupabase);
  assert.deepEqual([supabase.url, supabase.kunciPublik, supabase.tokenAkses], ['http://127.0.0.1:54321', 'kunci-anon', 'token-petugas']);
  assert.ok(pilihPenyimpananRiwayat('token-petugas', {}) instanceof PenyimpananRiwayatSupabase);
  assert.ok(pilihPenyimpananRiwayat(undefined, ENV) instanceof PenyimpananRiwayatTiruan);
});
