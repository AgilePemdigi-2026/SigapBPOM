// Boundary UC-03 Melakukan Login Dashboard: memeriksa isian login di server dan membentuk sesi (REQ-3.2).
// Meneruskan IP klien untuk pembatasan laju per IP (T-F3.1-03, NFR-11).
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals, cookies, clientAddress }) => {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return Response.json({ status: 'error', message: 'Permintaan tidak valid.', data: null }, { status: 400 });
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = (forwarded ? forwarded.split(',')[0].trim() : clientAddress) || '127.0.0.1';

  const hasil = await locals.autentikasi.masuk(
    { ...(body as Record<string, unknown>), ip },
    cookies,
  );

  return Response.json(
    {
      status: hasil.petugas ? 'success' : 'error',
      message: hasil.pesan,
      data: hasil.petugas && { nama: hasil.petugas.nama },
    },
    { status: hasil.kode },
  );
};
