// Boundary UC-06 (REQ-6.1, REQ-6.2, BR-3): petugas menyimpan hasil telaah. Middleware sudah menolak permintaan tanpa sesi;
// Astro security.checkOrigin menolak kiriman formulir lintas situs (PROJECT_RULES 5.7).
// Body JSON: { "tindakLanjut": "Telaah Dokumen" | "Perlu Pemeriksaan Lapangan" | "Bukan Kewenangan BPOM", "catatan": string }
import type { APIRoute } from 'astro';
import { penangananPetugas, respons, simpanTelaah } from '../../../../lib/penanganan.ts';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const isian = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  return respons(await simpanTelaah(penangananPetugas(locals.tokenAkses), params.tiket, isian?.tindakLanjut, isian?.catatan));
};
