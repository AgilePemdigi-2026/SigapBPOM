// Boundary UC-04 (REQ-4.5, T-F5.5-05): petugas berhak mengubah provider AI (cloud atau lokal) dari dashboard.
// POST /api/provider-ai dengan body JSON { provider: 'cloud' | 'lokal' }.
// Middleware sudah menolak permintaan tanpa sesi (401); Astro security.checkOrigin menolak kiriman lintas situs. Hak
// hak_atur_ai tidak dipercaya dari klien: RPC ubah_provider_ai dengan token petugas yang menegakkannya (403).
import type { APIRoute } from 'astro';
import { pengaturanProviderAi } from '../../lib/pemantauan.ts';

export const POST: APIRoute = async ({ request, locals }) => {
  // JSON rusak atau body kosong dianggap tanpa provider, sehingga control menjawab 400.
  const body = (await request.json().catch(() => null)) as { provider?: unknown } | null;
  const hasil = await pengaturanProviderAi(locals.tokenAkses).ubahProviderAi(body?.provider);
  return Response.json({ status: hasil.kode === 200 ? 'success' : 'error', message: hasil.pesan, data: hasil.data }, { status: hasil.kode, headers: { 'Cache-Control': 'no-store' } });
};
