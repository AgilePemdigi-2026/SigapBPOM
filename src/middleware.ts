// Boundary UC-03: setiap route dashboard memeriksa sesi di server sebelum halaman dikirim (PROJECT_RULES 5.4).
// Route di luar daftar publik dianggap dashboard, jadi halaman baru otomatis terlindungi.
import { defineMiddleware } from 'astro:middleware';
import { AutentikasiController } from './lib/AutentikasiController';
import { AdapterSesiTiruan } from './lib/sesiTiruan';

const autentikasi = new AutentikasiController(new AdapterSesiTiruan());
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
  return next();
});
