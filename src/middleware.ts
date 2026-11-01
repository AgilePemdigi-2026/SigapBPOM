// Boundary UC-03: setiap route dashboard memeriksa sesi di server sebelum halaman dikirim (PROJECT_RULES 5.4).
// Route di luar daftar publik dianggap dashboard, jadi halaman baru otomatis terlindungi.
import { defineMiddleware } from 'astro:middleware';
import { AutentikasiController, type AdapterSesi } from './lib/AutentikasiController';
import { bacaKonfigurasiSupabase } from './lib/konfigurasiSupabase';
import { SesiSupabase } from './lib/sesiSupabase';
import { AdapterSesiTiruan } from './lib/sesiTiruan';

// Sesi nyata (Supabase Auth) adalah bawaan. Sesi tiruan hanya untuk pengembangan lokal: SIGAP_SESI=tiruan, dan
// diabaikan di build produksi supaya akun demo tidak pernah aktif di server.
function buatAdapter(): AdapterSesi {
  if (!import.meta.env.PROD && process.env.SIGAP_SESI === 'tiruan') return new AdapterSesiTiruan();
  const konfigurasi = bacaKonfigurasiSupabase() ?? { url: '', kunciAnon: '' };
  return new SesiSupabase({ ...konfigurasi, secure: import.meta.env.PROD });
}

// NFR-12: SESI_IDLE_MENIT bisa diperkecil untuk pengujian, misalnya 1.
const idleMenit = Number(process.env.SESI_IDLE_MENIT);
const autentikasi = new AutentikasiController(buatAdapter(), idleMenit > 0 ? { batasIdleMs: idleMenit * 60_000 } : {});
const RUTE_PUBLIK = new Set(['/', '/homepage', '/login', '/api/login']);

export const onRequest = defineMiddleware(async (ctx, next) => {
  ctx.locals.autentikasi = autentikasi;
  const path = ctx.url.pathname.replace(/\/+$/, '') || '/';
  if (ctx.isPrerendered || RUTE_PUBLIK.has(path)) return next();

  const petugas = await autentikasi.sesiAktif(ctx.cookies);
  if (!petugas) {
    if (path.startsWith('/api/')) return Response.json({ status: 'error', message: 'Akses ditolak.', data: null }, { status: 401 });
    return ctx.redirect('/login');
  }
  ctx.locals.petugas = petugas;
  ctx.locals.tokenAkses = autentikasi.adapter.tokenAkses?.(ctx.cookies) ?? undefined;
  return next();
});
