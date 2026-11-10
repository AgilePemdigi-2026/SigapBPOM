// Boundary UC-06 (REQ-6.3): petugas menyimpan jadwal pemeriksaan lapangan. Middleware sudah menolak permintaan tanpa sesi;
// Astro security.checkOrigin menolak kiriman formulir lintas situs (PROJECT_RULES 5.7).
// Body JSON: { "tanggal": "YYYY-MM-DD", "unit": string }
import type { APIRoute } from 'astro';
import { penangananPetugas, respons, simpanJadwal } from '../../../../lib/penanganan.ts';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const isian = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  return respons(await simpanJadwal(penangananPetugas(locals.tokenAkses), params.tiket, isian?.tanggal, isian?.unit));
};
