// Boundary UC-08 (REQ-8.3, REQ-8.4, BR-8, NFR-14, T-F8.2-01): berkas laporan layanan PDF atau CSV untuk satu periode.
// GET /api/laporan?awal=YYYY-MM-DD&akhir=YYYY-MM-DD&format=pdf|csv
// Middleware sudah menolak permintaan tanpa sesi (401). LaporanController memeriksa hak ekspor lewat RPC boleh_ekspor dengan
// token petugas sebelum periode dan format dibaca, lalu memanggil rekap_layanan. Tanpa token (sesi tiruan pengembangan
// lokal) dipakai rekap tiruan.
import type { APIRoute } from 'astro';
import { laporanLayanan } from '../../lib/laporan.ts';

export const GET: APIRoute = async ({ url, locals }) => {
  const q = url.searchParams;
  const hasil = await laporanLayanan(locals.tokenAkses).unduhLaporan(q.get('awal'), q.get('akhir'), q.get('format'));
  if (hasil.kode !== 200) {
    return Response.json({ status: 'error', message: hasil.pesan, data: null }, { status: hasil.kode, headers: { 'Cache-Control': 'no-store' } });
  }
  const { nama, tipe, isi } = hasil.berkas;
  return new Response(isi, {
    headers: {
      'Content-Type': tipe,
      'Content-Disposition': `attachment; filename="${nama}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
