// Boundary UC-07 (REQ-7.3, BR-5): menonaktifkan materi lewat sesi petugas.
import type { APIRoute } from 'astro';
import { basisPengetahuan } from '../../../../lib/instans.ts';

export const POST: APIRoute = async ({ params, locals }) => {
  const petugas = locals.petugas;
  if (!petugas) {
    return Response.json({ status: 'error', message: 'Akses ditolak.', data: null }, { status: 401 });
  }

  const materiId = params.id;
  if (!materiId) {
    return Response.json({ status: 'error', message: 'Materi tidak ditemukan.', data: null }, { status: 400 });
  }

  const pengubah = petugas.id || petugas.nama || petugas.email;
  const controller = locals.basisPengetahuan || basisPengetahuan;
  const hasil = await controller.nonaktifkanMateri(materiId, pengubah);

  if (!hasil.berhasil) {
    return Response.json({ status: 'error', message: hasil.pesan, data: null }, { status: 404 });
  }

  return Response.json({ status: 'success', message: hasil.pesan, data: null }, { status: 200 });
};
