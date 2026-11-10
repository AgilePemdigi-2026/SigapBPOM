// Berawalan "_" agar Astro tidak menjadikannya route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from './laporan.ts';

process.env.SUPABASE_URL = 'http://supabase.uji';
process.env.SUPABASE_ANON_KEY = 'anon-uji';

const minggu = (awal: string, akhir: string, panggilan: number, tereskalasi: number, pengaduan_selesai: number) => ({ awal, akhir, panggilan, tereskalasi, pengaduan_selesai });
const REKAP_SEPTEMBER = {
  total: { panggilan: 2148, tereskalasi: 163, pengaduan_selesai: 97 },
  per_minggu: [
    minggu('2026-09-01', '2026-09-07', 512, 39, 22),
    minggu('2026-09-08', '2026-09-14', 498, 36, 24),
    minggu('2026-09-15', '2026-09-21', 521, 41, 25),
    minggu('2026-09-22', '2026-09-28', 476, 35, 19),
    minggu('2026-09-29', '2026-09-30', 141, 12, 7),
  ],
};

type Opsi = { boleh?: boolean; rekap?: () => Response };

/** Panggil GET /api/laporan dengan Supabase palsu yang menjawab RPC boleh_ekspor dan rekap_layanan. */
function unduh(query: string, opsi: Opsi = {}) {
  const panggilan: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    panggilan.push({ url, init });
    if (url.endsWith('/rpc/boleh_ekspor')) return Response.json(opsi.boleh ?? true);
    if (url.endsWith('/rpc/rekap_layanan')) return opsi.rekap?.() ?? Response.json(REKAP_SEPTEMBER);
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  const url = new URL(`http://sigap.uji/api/laporan?${query}`);
  const ctx = { url, request: new Request(url), locals: { tokenAkses: 'token-petugas' } } as unknown as Parameters<typeof GET>[0];
  return { hasil: GET(ctx) as Promise<Response>, panggilan };
}

const rpc = (panggilan: { url: string }[]) => panggilan.map((p) => p.url.split('/rpc/')[1]);

test('req_8_4 CSV terunduh untuk periode berisi data, dengan nama berkas memuat periode', async () => {
  const { hasil, panggilan } = unduh('awal=2026-09-01&akhir=2026-09-30&format=csv');
  const res = await hasil;
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'text/csv; charset=utf-8');
  assert.equal(res.headers.get('Content-Disposition'), 'attachment; filename="laporan-layanan_2026-09-01_2026-09-30.csv"');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const isi = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...isi.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const teks = new TextDecoder().decode(isi);
  assert.match(teks, /^Rekap dan Laporan Layanan\r\nPeriode,01-09-2026 s\.d\. 30-09-2026\r\nTotal Panggilan,2148\r\nKasus Tereskalasi,163\r\nPengaduan Selesai,97\r\n/);
  assert.match(teks, /\r\nTotal,2148,163,97\r\n$/);

  // Hak ekspor diperiksa lebih dulu, lalu rekap diminta dengan token petugas.
  assert.deepEqual(rpc(panggilan), ['boleh_ekspor', 'rekap_layanan']);
  for (const p of panggilan) assert.equal((p.init.headers as Record<string, string>).Authorization, 'Bearer token-petugas');
  assert.deepEqual(JSON.parse(panggilan[1].init.body as string), { p_awal: '2026-09-01', p_akhir: '2026-09-30' });
});

test('req_8_4 PDF terunduh untuk periode berisi data dan memuat tiga total', async () => {
  const res = await unduh('awal=2026-09-01&akhir=2026-09-30&format=pdf').hasil;
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/pdf');
  assert.equal(res.headers.get('Content-Disposition'), 'attachment; filename="laporan-layanan_2026-09-01_2026-09-30.pdf"');
  const pdf = String.fromCharCode(...new Uint8Array(await res.arrayBuffer()));
  assert.ok(pdf.startsWith('%PDF-'));
  assert.ok(pdf.endsWith('%%EOF\n'));
  for (const teks of ['Rekap dan Laporan Layanan', '01-09-2026 s.d. 30-09-2026', 'Total Panggilan', '2.148', 'Kasus Tereskalasi', '163', 'Pengaduan Selesai', '97', 'Total']) {
    assert.ok(pdf.includes(`(${teks}) Tj`), teks);
  }
});

test('req_8_3 br_8 nfr_14 petugas tanpa hak ekspor ditolak 403 dan rekap tidak diminta', async () => {
  for (const query of ['awal=2026-09-01&akhir=2026-09-30&format=pdf', 'awal=bukan&akhir=tanggal&format=xlsx', '']) {
    const { hasil, panggilan } = unduh(query, { boleh: false });
    const res = await hasil;
    assert.equal(res.status, 403, query);
    assert.deepEqual(await res.json(), { status: 'error', message: 'Anda tidak memiliki hak akses ekspor data.', data: null });
    assert.deepEqual(rpc(panggilan), ['boleh_ekspor']);
  }
});

test('req_8_4 periode atau format tidak sah ditolak 422 tanpa memanggil rekap_layanan', async () => {
  for (const query of [
    'awal=2026-09-30&akhir=2026-09-01&format=csv',
    'awal=2026-02-30&akhir=2026-03-01&format=csv',
    'awal=01-09-2026&akhir=30-09-2026&format=csv',
    'akhir=2026-09-30&format=csv',
    'awal=2025-01-01&akhir=2026-06-30&format=pdf',
    'awal=2026-09-01&akhir=2026-09-30&format=xlsx',
    'awal=2026-09-01&akhir=2026-09-30',
  ]) {
    const { hasil, panggilan } = unduh(query);
    const res = await hasil;
    assert.equal(res.status, 422, query);
    assert.deepEqual(await res.json(), { status: 'error', message: 'Permintaan tidak valid.', data: null });
    assert.deepEqual(rpc(panggilan), ['boleh_ekspor']);
  }
});

test('req_8_2 periode tanpa data tidak menghasilkan berkas, rekap gagal menjadi pesan sistem', async () => {
  const kosong = { total: { panggilan: 0, tereskalasi: 0, pengaduan_selesai: 0 }, per_minggu: [minggu('2025-01-01', '2025-01-07', 0, 0, 0)] };
  const res = await unduh('awal=2025-01-01&akhir=2025-01-31&format=csv', { rekap: () => Response.json(kosong) }).hasil;
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { status: 'error', message: 'Data tidak tersedia pada periode tersebut.', data: null });

  const gagal = await unduh('awal=2026-09-01&akhir=2026-09-30&format=pdf', { rekap: () => new Response('<html>Bad Gateway</html>', { status: 502 }) }).hasil;
  assert.equal(gagal.status, 500);
  assert.deepEqual(await gagal.json(), { status: 'error', message: 'Terjadi kesalahan pada sistem.', data: null });
});

test('req_8_4 berkas tidak memuat nama atau nomor telepon walau RPC mengembalikan field tambahan', async () => {
  const bocor = () =>
    Response.json({
      total: { ...REKAP_SEPTEMBER.total, nama_petugas: 'Rina Wulandari' },
      per_minggu: REKAP_SEPTEMBER.per_minggu.map((m) => ({ ...m, nama_penelepon: 'Budi Santoso', nomor_telepon: '081234567890' })),
    });
  for (const format of ['csv', 'pdf']) {
    const res = await unduh(`awal=2026-09-01&akhir=2026-09-30&format=${format}`, { rekap: bocor }).hasil;
    assert.equal(res.status, 200);
    const isi = new TextDecoder('latin1').decode(await res.arrayBuffer());
    assert.doesNotMatch(isi, /Budi|Santoso|Rina|Wulandari|081234567890|\+62/, format);
  }
});
