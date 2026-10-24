// Boundary UC-03 Melakukan Login Dashboard: memeriksa isian login di server dan membentuk sesi (REQ-3.2).
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals, cookies }) => {
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
