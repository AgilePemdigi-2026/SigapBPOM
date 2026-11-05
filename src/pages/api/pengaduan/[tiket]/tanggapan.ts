// Boundary UC-06 (REQ-6.4): petugas menyimpan tanggapan resmi. Middleware sudah menolak permintaan tanpa sesi;
// Astro security.checkOrigin menolak kiriman formulir lintas situs (PROJECT_RULES 5.7).
// Body JSON: { "isi": string }
import type { APIRoute } from 'astro';
import { penanganan } from '../../../../lib/penanganan.ts';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const isian = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const hasil = await penanganan(locals.tokenAkses).simpanTanggapan(params.tiket, isian?.isi);
  return Response.json({ status: hasil.kode === 200 ? 'success' : 'error', message: hasil.pesan, data: hasil.data }, { status: hasil.kode });
};
