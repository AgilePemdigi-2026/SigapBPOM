import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AstroCookies } from 'astro';
import { COOKIE_AKSES, COOKIE_REFRESH, PESAN_SISTEM, SesiSupabase } from './sesiSupabase.ts';
import { AutentikasiController, PESAN_LOGIN } from './AutentikasiController.ts';

const UID = '11111111-2222-3333-4444-555555555555';
const jwt = (sessionId: string | null) =>
  `h.${Buffer.from(JSON.stringify(sessionId ? { session_id: sessionId } : {})).toString('base64url')}.s`;
const TOKEN = jwt('sesi-1');
const KUNCI_ANON = 'anon-uji';
const KUNCI_LOGIN = 'kunci-login-uji';

function buatCookies(awal: Record<string, string> = {}) {
  const isi = new Map(Object.entries(awal));
  const dipasang: Record<string, unknown> = {};
  const cookies = {
    get: (n: string) => (isi.has(n) ? { value: isi.get(n)! } : undefined),
    set: (n: string, v: string, o: unknown) => { isi.set(n, v); dipasang[n] = o; },
    delete: (n: string) => { isi.delete(n); },
  } as unknown as AstroCookies;
  return { cookies, isi, dipasang };
}

type Panggilan = { url: string; method: string; auth: string; apikey: string; kunci?: string; body: unknown };
type Penangan = (p: Panggilan) => { status?: number; json?: unknown } | undefined;

function buat(penangan: Penangan, kunciLogin = KUNCI_LOGIN) {
  const panggilan: Panggilan[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    const p = { url, method: init.method ?? 'GET', auth: h.Authorization, apikey: h.apikey, kunci: h['x-sigap-kunci'], body: init.body ? JSON.parse(String(init.body)) : undefined };
    panggilan.push(p);
    const r = penangan(p) ?? { status: 404 };
    return new Response(JSON.stringify(r.json ?? null), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  const sesi = new SesiSupabase({ url: 'http://supabase.uji/', kunciAnon: KUNCI_ANON, kunciLogin, secure: true, fetch: fakeFetch });
  return { sesi, panggilan };
}

const loginOk = { json: { status: 'success', message: 'OK', data: { sesi: { access_token: TOKEN, refresh_token: 'rt-1' }, petugas: { id: UID, nama: 'Dewi Lestari' } } } };
const ditolak = (message: string) => ({ status: 401, json: { status: 'error', message, data: null } });

// Supabase palsu: token yang dikenal menghasilkan petugas, sisanya 401.
const petugasOk = (tokenSah: string, adalahPetugas = true): Penangan => (p) => {
  if (p.url.endsWith('/auth/v1/user')) return p.auth === `Bearer ${tokenSah}` ? { json: { id: UID, email: 'dewi@pom.go.id' } } : { status: 401 };
  if (p.url.endsWith('/rpc/is_petugas')) return { json: adalahPetugas };
  if (p.url.includes('/rest/v1/petugas?')) return { json: [{ nama: 'Dewi Lestari' }] };
  return undefined;
};

test('login memanggil Edge Function login dengan kunci anon dan kunci login server, lalu memasang cookie HttpOnly Secure SameSite Lax', async () => {
  const { sesi, panggilan } = buat((p) => {
    if (p.url.endsWith('/functions/v1/login')) return loginOk;
    return petugasOk(TOKEN)(p);
  });
  const { cookies, isi, dipasang } = buatCookies();
  assert.deepEqual(await sesi.masuk('dewi@pom.go.id', 'rahasia', cookies), { nama: 'Dewi Lestari', email: 'dewi@pom.go.id' });
  assert.equal(panggilan[0].url, 'http://supabase.uji/functions/v1/login');
  assert.deepEqual(panggilan[0].body, { email: 'dewi@pom.go.id', password: 'rahasia' });
  assert.ok(panggilan.every((p) => p.apikey === KUNCI_ANON));
  assert.equal(panggilan[0].auth, `Bearer ${KUNCI_ANON}`);
  assert.equal(panggilan[0].kunci, KUNCI_LOGIN);
  assert.ok(panggilan.slice(1).every((p) => p.kunci === undefined), 'kunci login hanya untuk fungsi login');
  assert.equal(isi.get(COOKIE_AKSES), TOKEN);
  assert.equal(isi.get(COOKIE_REFRESH), 'rt-1');
  for (const o of Object.values(dipasang)) assert.deepEqual(o, { path: '/', httpOnly: true, secure: true, sameSite: 'lax' });
});

test('req_3_2 login dengan token dari Edge Function yang bukan petugas ditolak tanpa cookie dan sesinya dicabut', async () => {
  const { sesi, panggilan } = buat((p) => {
    if (p.url.endsWith('/functions/v1/login')) return loginOk;
    return petugasOk(TOKEN, false)(p);
  });
  const { cookies, isi } = buatCookies();
  assert.equal(await sesi.masuk('a@pom.go.id', 'x', cookies), null);
  assert.equal(isi.size, 0);
  assert.ok(panggilan.some((p) => p.url.endsWith('/auth/v1/logout?scope=local') && p.method === 'POST' && p.auth === `Bearer ${TOKEN}`));
});

test('req_3_4 pesan kredensial salah dan akun terkunci dari Edge Function diteruskan, tanpa cookie', async () => {
  for (const pesan of [PESAN_LOGIN.kosong, PESAN_LOGIN.salah, PESAN_LOGIN.dikunci]) {
    const { sesi } = buat(() => ditolak(pesan));
    const { cookies, isi } = buatCookies();
    assert.deepEqual(await sesi.masuk('a@pom.go.id', 'x', cookies), { gagal: pesan, kode: 401 });
    assert.equal(isi.size, 0);
  }
});

test('req_3_4 pesan Edge Function di luar kamus UC-03, misalnya kunci server ditolak, menjadi pesan sistem', async () => {
  for (const [status, message] of [[401, 'Akses ditolak.'], [503, 'Terjadi kesalahan pada sistem.']] as const) {
    const { sesi } = buat(() => ({ status, json: { status: 'error', message, data: null } }));
    assert.deepEqual(await sesi.masuk('a@pom.go.id', 'x', buatCookies().cookies), { gagal: PESAN_SISTEM, kode: 503 });
  }
});

test('req_3_2 format lama Edge Function login tetap terbaca dan tanpa SIGAP_KUNCI_LOGIN header kunci tidak dikirim', async () => {
  const { sesi, panggilan } = buat((p) => {
    if (p.url.endsWith('/functions/v1/login')) return { json: { sukses: true, pesan: 'Login berhasil!', sesi: { access_token: TOKEN, refresh_token: 'rt-1' } } };
    return petugasOk(TOKEN)(p);
  }, '');
  assert.deepEqual(await sesi.masuk('dewi@pom.go.id', 'x', buatCookies().cookies), { nama: 'Dewi Lestari', email: 'dewi@pom.go.id' });
  assert.equal(panggilan[0].kunci, undefined);
  const lama = buat(() => ({ status: 401, json: { sukses: false, pesan: PESAN_LOGIN.salah } })).sesi;
  assert.deepEqual(await lama.masuk('a@pom.go.id', 'x', buatCookies().cookies), { gagal: PESAN_LOGIN.salah, kode: 401 });
});

test('galat Edge Function atau jaringan tidak membocorkan detail dan menjadi pesan sistem', async () => {
  const { sesi } = buat(() => ({ status: 400, json: { error: 'relation "petugas" does not exist' } }));
  assert.deepEqual(await sesi.masuk('a@pom.go.id', 'x', buatCookies().cookies), { gagal: PESAN_SISTEM, kode: 503 });
  const putus = new SesiSupabase({ url: 'http://x', kunciAnon: KUNCI_ANON, secure: true, fetch: (async () => { throw new Error('putus'); }) as unknown as typeof fetch });
  assert.deepEqual(await putus.masuk('a@pom.go.id', 'x', buatCookies().cookies), { gagal: PESAN_SISTEM, kode: 503 });
});

test('tanpa konfigurasi Supabase login gagal tertutup dan tidak ada sesi yang sah', async () => {
  const sesi = new SesiSupabase({ url: '', kunciAnon: '', secure: true });
  assert.deepEqual(await sesi.masuk('a@pom.go.id', 'x', buatCookies().cookies), { gagal: PESAN_SISTEM, kode: 503 });
  assert.equal(await sesi.baca(buatCookies({ [COOKIE_AKSES]: TOKEN }).cookies), null);
});

test('baca memvalidasi token dengan auth.getUser dan memeriksa is_petugas', async () => {
  const { sesi, panggilan } = buat(petugasOk(TOKEN));
  const { cookies } = buatCookies({ [COOKIE_AKSES]: TOKEN, [COOKIE_REFRESH]: 'rt-1' });
  assert.deepEqual(await sesi.baca(cookies), { nama: 'Dewi Lestari', email: 'dewi@pom.go.id' });
  assert.ok(panggilan.some((p) => p.url.endsWith('/auth/v1/user') && p.auth === `Bearer ${TOKEN}`));
  assert.ok(panggilan.some((p) => p.url.endsWith('/rpc/is_petugas') && p.auth === `Bearer ${TOKEN}`));
  assert.ok(panggilan.every((p) => p.apikey === KUNCI_ANON));
});

test('pengguna Supabase yang bukan petugas tidak mendapat sesi dashboard', async () => {
  const { sesi } = buat(petugasOk(TOKEN, false));
  assert.equal(await sesi.baca(buatCookies({ [COOKIE_AKSES]: TOKEN }).cookies), null);
});

test('tanpa cookie, token palsu, atau token kedaluwarsa tanpa refresh: tidak ada sesi', async () => {
  const { sesi } = buat(petugasOk(TOKEN));
  assert.equal(await sesi.baca(buatCookies().cookies), null);
  assert.equal(await sesi.baca(buatCookies({ [COOKIE_AKSES]: 'palsu' }).cookies), null);
});

test('token akses kedaluwarsa ditukar dengan refresh token dan cookie diperbarui', async () => {
  const baru = jwt('sesi-1');
  const { sesi, panggilan } = buat((p) => {
    if (p.url.includes('/auth/v1/token?grant_type=refresh_token')) return p.body && (p.body as { refresh_token: string }).refresh_token === 'rt-lama' ? { json: { access_token: baru + 'x', refresh_token: 'rt-baru' } } : { status: 400 };
    return petugasOk(baru + 'x')(p);
  });
  const { cookies, isi } = buatCookies({ [COOKIE_AKSES]: 'kedaluwarsa', [COOKIE_REFRESH]: 'rt-lama' });
  assert.equal((await sesi.baca(cookies))?.nama, 'Dewi Lestari');
  assert.equal(isi.get(COOKIE_AKSES), baru + 'x');
  assert.equal(isi.get(COOKIE_REFRESH), 'rt-baru');
  assert.ok(panggilan.some((p) => p.url.includes('grant_type=refresh_token') && p.auth === `Bearer ${KUNCI_ANON}`));
});

test('refresh token ditolak menghapus cookie sesi', async () => {
  const { sesi } = buat((p) => (p.url.includes('grant_type=refresh_token') ? { status: 400 } : { status: 401 }));
  const { cookies, isi } = buatCookies({ [COOKIE_AKSES]: 'kedaluwarsa', [COOKIE_REFRESH]: 'rt-cabut' });
  assert.equal(await sesi.baca(cookies), null);
  assert.equal(isi.size, 0);
});

test('kunci sesi memakai session_id yang stabil dan null bila tidak ada', () => {
  const { sesi } = buat(() => undefined);
  assert.equal(sesi.kunci(buatCookies({ [COOKIE_AKSES]: jwt('sesi-9') }).cookies), 'sesi-9');
  assert.equal(sesi.kunci(buatCookies({ [COOKIE_AKSES]: jwt(null) }).cookies), null);
  assert.equal(sesi.kunci(buatCookies({ [COOKIE_AKSES]: 'bukan-jwt' }).cookies), null);
  assert.equal(sesi.kunci(buatCookies().cookies), null);
});

test('keluar mencabut sesi di Supabase dengan token pemiliknya dan menghapus kedua cookie', async () => {
  const { sesi, panggilan } = buat(() => ({ status: 204 }));
  const { cookies, isi } = buatCookies({ [COOKIE_AKSES]: TOKEN, [COOKIE_REFRESH]: 'rt-1' });
  await sesi.keluar(cookies);
  assert.equal(panggilan[0].url, 'http://supabase.uji/auth/v1/logout?scope=local');
  assert.equal(panggilan[0].method, 'POST');
  assert.equal(panggilan[0].auth, `Bearer ${TOKEN}`);
  assert.equal(isi.size, 0);
});

test('keluar tetap menghapus cookie walau Supabase tidak terjangkau', async () => {
  const putus = new SesiSupabase({ url: 'http://x', kunciAnon: KUNCI_ANON, secure: true, fetch: (async () => { throw new Error('putus'); }) as unknown as typeof fetch });
  const { cookies, isi } = buatCookies({ [COOKIE_AKSES]: TOKEN, [COOKIE_REFRESH]: 'rt-1' });
  await putus.keluar(cookies);
  assert.equal(isi.size, 0);
});

test('controller meneruskan pesan penguncian dari adapter dan mencatat aktivitas sesi nyata', async () => {
  const terkunci = buat(() => ditolak(PESAN_LOGIN.dikunci));
  const c1 = new AutentikasiController(terkunci.sesi);
  assert.deepEqual(await c1.masuk({ email: 'a@pom.go.id', password: 'x' }, buatCookies().cookies), { kode: 401, pesan: 'Akses dikunci sementara. Hubungi administrator.', petugas: null });

  const ok = buat((p) => (p.url.endsWith('/functions/v1/login') ? loginOk : petugasOk(TOKEN)(p)));
  const c2 = new AutentikasiController(ok.sesi);
  const { cookies } = buatCookies();
  assert.equal((await c2.masuk({ email: 'dewi@pom.go.id', password: 'x' }, cookies)).kode, 200);
  assert.equal((await c2.sesiAktif(cookies))?.email, 'dewi@pom.go.id');
});
