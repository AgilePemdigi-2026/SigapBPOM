// Berawalan "_" agar Astro tidak menjadikannya route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from './nonaktifkan.ts';

process.env.SUPABASE_URL = 'http://supabase.uji';
process.env.SUPABASE_ANON_KEY = 'anon-uji';

const ID = '0b6f8c1e-2f4a-4d7b-9a51-3c2e1d0f9a88';

function nonaktifkan(id: string, tokenAkses: string | undefined, baris: unknown[]) {
  const panggilan: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    panggilan.push({ url, init });
    return Response.json(baris);
  }) as unknown as typeof fetch;
  const ctx = { params: { id }, locals: { tokenAkses } } as unknown as Parameters<typeof POST>[0];
  return { hasil: POST(ctx) as Promise<Response>, panggilan };
}

test('req_7_3 dengan sesi Supabase materi dinonaktifkan lewat PATCH memakai token petugas', async () => {
  const { hasil, panggilan } = nonaktifkan(ID, 'token-petugas', [{ id: ID }]);
  const res = await hasil;
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'success', message: 'Materi ditandai tidak aktif.', data: null });
  assert.equal(panggilan.length, 1);
  assert.equal(panggilan[0].url, `http://supabase.uji/rest/v1/materi_pengetahuan?id=eq.${ID}&select=id`);
  assert.equal(panggilan[0].init.method, 'PATCH');
  assert.equal((panggilan[0].init.headers as Record<string, string>).Authorization, 'Bearer token-petugas');

  const tidakAda = await nonaktifkan(ID, 'token-petugas', []).hasil;
  assert.equal(tidakAda.status, 404);
  assert.deepEqual(await tidakAda.json(), { status: 'error', message: 'Materi gagal dinonaktifkan. Muat ulang halaman untuk mencoba lagi.', data: null });
});

test('req_7_3 tanpa token sesi (pengembangan lokal) penyimpanan tiruan dipakai dan Supabase tidak dipanggil', async () => {
  const { hasil, panggilan } = nonaktifkan('tiruan-1', undefined, []);
  assert.equal((await hasil).status, 200);
  assert.equal(panggilan.length, 0);
});
