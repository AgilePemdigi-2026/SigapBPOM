// Boundary UC-06 (REQ-6.5, REQ-6.6, BR-2): petugas menutup tiket. Middleware sudah menolak permintaan tanpa sesi;
// Astro security.checkOrigin menolak kiriman formulir lintas situs (PROJECT_RULES 5.7). Tanpa body.
import type { APIRoute } from 'astro';
import { penangananPetugas, respons, tutupTiket } from '../../../../lib/penanganan.ts';

export const POST: APIRoute = async ({ params, locals }) => {
  return respons(await tutupTiket(penangananPetugas(locals.tokenAkses), params.tiket));
};
