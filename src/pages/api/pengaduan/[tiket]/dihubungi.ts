// Boundary ADR 0006: petugas menandai pelapor sudah dihubungi lewat WhatsApp atau telepon. Middleware sudah menolak
// permintaan tanpa sesi; Astro security.checkOrigin menolak kiriman formulir lintas situs (PROJECT_RULES 5.7). Tanpa body.
import type { APIRoute } from 'astro';
import { penangananPetugas, respons, tandaiSudahDihubungi } from '../../../../lib/penanganan.ts';

export const POST: APIRoute = async ({ params, locals }) => {
  return respons(await tandaiSudahDihubungi(penangananPetugas(locals.tokenAkses), params.tiket));
};
