// Berawalan "_" agar Astro tidak menjadikannya route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POST } from './simpan-materi.ts';

process.env.SUPABASE_URL = 'http://supabase.uji';
process.env.SUPABASE_ANON_KEY = 'anon-uji';

const BATAS_BYTE = 256 * 1024;

function kirim(isi: string, balasan: () => Response) {
  const panggilan: string[] = [];
  globalThis.fetch = (async (url: string) => {
    panggilan.push(url);
    return balasan();
  }) as unknown as typeof fetch;
  const request = new Request('http://astro.uji/api/simpan-materi', { method: 'POST', body: isi });
  const ctx = { request, locals: { tokenAkses: 'token-petugas' } } as unknown as Parameters<typeof POST>[0];
  return { hasil: POST(ctx) as Promise<Response>, panggilan };
}

test('req_7_1 isi simpan materi dibatasi per byte, bukan per karakter', async () => {
  // Setiap "é" dua byte: jumlah karakternya di bawah batas, jumlah byte-nya di atas batas.
  const { hasil, panggilan } = kirim('é'.repeat(BATAS_BYTE / 2 + 1), () => Response.json({}));
  const res = await hasil;
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { status: 'error', message: 'Permintaan tidak valid.', data: null });
  assert.equal(panggilan.length, 0);
});

test('req_7_1 galat 5xx gateway Supabase diganti pesan sistem, galat 4xx diteruskan', async () => {
  const gateway = kirim('{}', () => new Response('WORKER_LIMIT: compute resources exhausted', { status: 546 }));
  const res = await gateway.hasil;
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { status: 'error', message: 'Terjadi kesalahan pada sistem.', data: null });

  const tolak = { status: 'error', message: 'Rujukan sumber wajib diisi.', data: null };
  const ditolak = await kirim('{}', () => Response.json(tolak, { status: 422 })).hasil;
  assert.equal(ditolak.status, 422);
  assert.deepEqual(await ditolak.json(), tolak);
});

test('req_7_1 Tambah Materi mengirim lewat proxy ini, bukan langsung ke Edge Function tanpa token', () => {
  const halaman = readFileSync(new URL('../basis-pengetahuan.astro', import.meta.url), 'utf8');
  assert.match(halaman, /fetch\('\/api\/simpan-materi'/);
  assert.doesNotMatch(halaman, /functions\/v1/);
});
