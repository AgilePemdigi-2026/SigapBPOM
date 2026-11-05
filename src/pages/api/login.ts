// Boundary UC-03 Melakukan Login Dashboard: memeriksa isian login di server dan membentuk sesi (REQ-3.2).
// Kredensial diperiksa oleh Supabase Auth lewat Edge Function login; pesan penolakannya diteruskan ke browser.
import type { APIRoute } from 'astro';
import { PembatasLaju, ipKlien } from '../../lib/pembatasLaju';

// PROJECT_RULES 5.2: batas laju login per IP. Pesannya memakai kamus pesan UC-03. LOGIN_PERCOBAAN_MAKS hanya untuk uji
// penerimaan lokal (`npm run test:bdd:ui`), yang login berkali-kali dari satu IP; bawaannya tetap 20 per 15 menit.
const pembatas = new PembatasLaju({ maks: Number(process.env.LOGIN_PERCOBAAN_MAKS) || undefined });
const PESAN_DIBATASI = 'Akses dikunci sementara. Hubungi administrator.';

export const POST: APIRoute = async ({ request, locals, cookies, clientAddress }) => {
  let soket = '';
  try {
    soket = clientAddress;
  } catch {
    // Alamat soket tidak tersedia di semua mode; di produksi alamat klien datang dari Caddy.
  }
  const ip = ipKlien(request.headers, soket || 'tak-dikenal');
  if (!pembatas.izinkan(ip)) {
    return Response.json({ status: 'error', message: PESAN_DIBATASI, data: null }, { status: 429 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return Response.json({ status: 'error', message: 'Permintaan tidak valid.', data: null }, { status: 400 });
  }
  const hasil = await locals.autentikasi.masuk(body, cookies);
  return Response.json(
    { status: hasil.petugas ? 'success' : 'error', message: hasil.pesan, data: hasil.petugas && { nama: hasil.petugas.nama } },
    { status: hasil.kode },
  );
};
