import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorSigap } from '../control/InformasiProdukController.ts';
import { layani } from './http.ts';

// Deno tiruan: layani() mendaftarkan penangan lewat Deno.serve dan membaca kunci lewat Deno.env saat request datang.
const env = new Map<string, string>();
let tangani: (req: Request) => Promise<Response>;
(globalThis as unknown as { Deno: unknown }).Deno = {
  serve: (h: typeof tangani) => { tangani = h; },
  env: { get: (n: string) => env.get(n) },
};

const kirim = (headers: Record<string, string> = {}, method = 'POST') =>
  tangani(new Request('http://fungsi.uji/login', { method, headers, body: method === 'POST' ? '{}' : undefined }));

test('nfr_11 fungsi login menolak permintaan dari origin asing tanpa kunci server dan tidak mengirim header CORS', async () => {
  env.set('SIGAP_KUNCI_LOGIN', 'kunci-login-uji');
  env.set('SIGAP_KUNCI_INTERNAL', 'kunci-internal-uji');
  layani(async () => { throw new ErrorSigap(401, 'Login gagal. Email atau password Anda salah.'); }, { nama: 'SIGAP_KUNCI_LOGIN', opsional: true });

  const asing = await kirim({ Origin: 'https://situs-asing.example' });
  assert.equal(asing.status, 401);
  assert.deepEqual(await asing.json(), { status: 'error', message: 'Akses ditolak.', data: null });
  assert.equal(asing.headers.get('access-control-allow-origin'), null);

  const preflight = await kirim({ Origin: 'https://situs-asing.example' }, 'OPTIONS');
  assert.equal(preflight.status, 405);
  assert.equal(preflight.headers.get('access-control-allow-origin'), null);

  assert.equal((await kirim({ 'x-sigap-kunci': 'kunci-internal-uji' })).status, 401, 'kunci internal bukan kunci login');

  const ditolak = await kirim({ 'x-sigap-kunci': 'kunci-login-uji' });
  assert.equal(ditolak.status, 401);
  assert.deepEqual(await ditolak.json(), { status: 'error', message: 'Login gagal. Email atau password Anda salah.', data: null });
});

test('nfr_11 kunci login diwajibkan hanya setelah SIGAP_KUNCI_LOGIN diisi, kunci internal selalu wajib', async () => {
  env.clear();
  layani(async () => ({ sesi: 's' }), { nama: 'SIGAP_KUNCI_LOGIN', opsional: true });
  const tanpaKunci = await kirim();
  assert.equal(tanpaKunci.status, 200);
  assert.deepEqual(await tanpaKunci.json(), { status: 'success', message: 'OK', data: { sesi: 's' } });

  layani(async () => ({}));
  assert.equal((await kirim({ 'x-sigap-kunci': '' })).status, 401, 'gagal tertutup bila SIGAP_KUNCI_INTERNAL kosong');
});
