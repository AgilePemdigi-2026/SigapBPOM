// Boundary UC-06 (REQ-6.4): petugas menyimpan tanggapan resmi. Middleware sudah menolak permintaan tanpa sesi;
// Astro security.checkOrigin menolak kiriman formulir lintas situs (PROJECT_RULES 5.7).
// Body JSON: { "isi": string }
import type { APIRoute } from 'astro';
import { penangananPetugas, respons, simpanTanggapan } from '../../../../lib/penanganan.ts';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const isian = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  return respons(await simpanTanggapan(penangananPetugas(locals.tokenAkses), params.tiket, isian?.isi));
};
