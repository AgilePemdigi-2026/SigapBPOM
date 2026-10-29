import { defineMiddleware } from 'astro:middleware';
import { AutentikasiController } from './lib/AutentikasiController';
import { AdapterSesiTiruan } from './lib/sesiTiruan';
import { basisPengetahuan } from './lib/instans';

// NFR-12: SESI_IDLE_MENIT bisa diperkecil untuk pengujian, misalnya 1.
const idleMenit = Number(process.env.SESI_IDLE_MENIT);
const autentikasi = new AutentikasiController(new AdapterSesiTiruan(), idleMenit > 0 ? { batasIdleMs: idleMenit * 60_000 } : {});
const RUTE_PUBLIK = new Set(['/', '/homepage', '/login', '/api/login']);

export const onRequest = defineMiddleware(async (ctx, next) => {
  ctx.locals.autentikasi = autentikasi;
  ctx.locals.basisPengetahuan = basisPengetahuan;
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
