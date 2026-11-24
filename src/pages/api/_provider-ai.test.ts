// Berawalan "_" agar Astro tidak menjadikannya route.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from './provider-ai.ts';

process.env.SUPABASE_URL = 'http://supabase.uji';
process.env.SUPABASE_ANON_KEY = 'anon-uji';

const fetchAsli = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchAsli;
});

type Opsi = { boleh?: boolean; ubah?: () => Response };

/** Panggil POST /api/provider-ai dengan Supabase palsu yang menjawab RPC dan pembacaan pengaturan_ai. */
function kirim(body: string, opsi: Opsi = {}) {
  const panggilan: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    panggilan.push({ url, init });
    if (url.endsWith('/rpc/ubah_provider_ai')) return opsi.ubah?.() ?? Response.json({ provider: 'lokal', diubah_oleh: 'u-1', diubah_pada: '2026-11-25T01:00:00Z' });
    if (url.endsWith('/rpc/ambil_pengaturan_ai')) return Response.json({ provider: 'lokal', diubah_pada: '2026-11-25T01:00:00Z', nama: 'Rina', boleh_ubah: opsi.boleh ?? true });
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  const request = new Request('http://sigap.uji/api/provider-ai', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
  const ctx = { request, locals: { tokenAkses: 'token-petugas' } } as unknown as Parameters<typeof POST>[0];
  return { hasil: POST(ctx) as Promise<Response>, panggilan };
}

const rpcUbah = (panggilan: { url: string }[]) => panggilan.filter((p) => p.url.endsWith('/rpc/ubah_provider_ai'));

test('req_4_5 body provider diteruskan ke RPC dengan token petugas dan respons berformat status, message, data', async () => {
  const { hasil, panggilan } = kirim(JSON.stringify({ provider: 'lokal' }));
  const res = await hasil;
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    status: 'success',
    message: 'Provider AI berhasil diubah.',
    data: { provider: 'lokal', diubahOleh: 'Rina', diubahPada: '2026-11-25T01:00:00Z', bolehUbah: true },
  });
  const [rpc] = rpcUbah(panggilan);
  assert.deepEqual(JSON.parse(rpc.init.body as string), { p_provider: 'lokal' });
  assert.equal((rpc.init.headers as Record<string, string>).Authorization, 'Bearer token-petugas');
});

test('req_4_5 petugas tanpa hak mendapat 403 dari RPC dan pesan tanpa hak', async () => {
  const { hasil } = kirim(JSON.stringify({ provider: 'lokal' }), { ubah: () => Response.json({ code: '42501', message: 'x' }, { status: 403 }) });
  const res = await hasil;
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { status: 'error', message: 'Anda tidak memiliki hak mengubah provider AI.', data: null });
});

test('req_4_5 JSON rusak, body kosong, atau provider tidak valid ditolak 400 tanpa memanggil RPC', async () => {
  for (const body of ['{bukan json', '', '{}', JSON.stringify({ provider: 'gpt' }), JSON.stringify({ provider: 5 }), '"lokal"', 'null']) {
    const { hasil, panggilan } = kirim(body);
    const res = await hasil;
    assert.equal(res.status, 400, body);
    assert.deepEqual(await res.json(), { status: 'error', message: 'Permintaan tidak valid.', data: null });
    assert.equal(panggilan.length, 0, body);
  }
});
