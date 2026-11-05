// Boundary UC-07 (REQ-7.3, BR-5): petugas menonaktifkan materi. Middleware sudah menolak permintaan tanpa sesi.
import type { APIRoute } from 'astro';
import { basisPengetahuan } from '../../../../lib/basisPengetahuan.ts';

export const POST: APIRoute = async ({ params, locals }) => {
  const hasil = await basisPengetahuan(locals.tokenAkses).nonaktifkanMateri(params.id);
  return Response.json({ status: hasil.kode === 200 ? 'success' : 'error', message: hasil.pesan, data: null }, { status: hasil.kode });
};
