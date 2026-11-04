// Boundary UC-06 (REQ-6.1, REQ-6.2, BR-3): petugas menyimpan hasil telaah. Middleware sudah menolak permintaan tanpa sesi;
// Astro security.checkOrigin menolak kiriman formulir lintas situs (PROJECT_RULES 5.7).
// Body JSON: { "tindakLanjut": "telaah_dokumen" | "perlu_pemeriksaan_lapangan" | "bukan_kewenangan_bpom", "catatan": string }
import type { APIRoute } from 'astro';
import { penanganan } from '../../../../lib/penanganan.ts';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const isian = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const hasil = await penanganan(locals.tokenAkses).simpanTelaah(params.tiket, isian?.tindakLanjut, isian?.catatan);
  return Response.json({ status: hasil.kode === 200 ? 'success' : 'error', message: hasil.pesan, data: hasil.data }, { status: hasil.kode });
};
