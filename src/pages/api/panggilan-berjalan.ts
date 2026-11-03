// Boundary UC-04 (REQ-4.2, T-F5.2-01): daftar panggilan aktif untuk pembaruan otomatis halaman Panggilan Berjalan.
// Di balik middleware autentikasi; nomor telepon sudah tersamar.
import type { APIRoute } from 'astro';
import { pemantauanLayanan } from '../../lib/pemantauan';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const panggilan = await pemantauanLayanan(locals.tokenAkses).panggilanBerjalan();
    return Response.json({ status: 'success', message: 'OK', data: { panggilan } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    // PROJECT_RULES 5.10: hanya jenis galat, tanpa isi atau stack.
    console.error('panggilan-berjalan', e instanceof Error ? e.name : 'unknown');
    return Response.json({ status: 'error', message: 'Data panggilan gagal dimuat.', data: null }, { status: 500 });
  }
};
