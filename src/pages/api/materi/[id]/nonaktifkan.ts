// Boundary UC-07 (REQ-7.3, BR-5): petugas menonaktifkan materi. Middleware sudah menolak permintaan tanpa sesi.
import type { APIRoute } from 'astro';
import { BasisPengetahuanController } from '../../../../lib/BasisPengetahuanController';
import { PenyimpananMateriTiruan } from '../../../../lib/mock/materiTiruan';

// ponytail: penyimpanan tiruan sama seperti halaman Basis Pengetahuan sampai T-F3.1-03 memberi token sesi Supabase.
export const POST: APIRoute = async ({ params }) => {
  const basis = new BasisPengetahuanController(new PenyimpananMateriTiruan());
  const hasil = await basis.nonaktifkanMateri(params.id);
  return Response.json({ status: hasil.berhasil ? 'success' : 'error', message: hasil.pesan, data: null }, { status: hasil.berhasil ? 200 : 404 });
};
