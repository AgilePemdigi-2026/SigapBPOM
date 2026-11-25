// Boundary UC-04 (F5.4, T-F5.4-01): data halaman Pantau AI Agent untuk pembaruan otomatis tampilan Kantor.
// Di balik middleware autentikasi; nomor telepon panggilan sudah tersamar dan argumen tool tidak pernah dibaca.
import type { APIRoute } from 'astro';
import { pemantauanLayanan } from '../../lib/pemantauan';
import { PESAN_PEMANTAUAN } from '../../lib/PemantauanLayananController';
import { ringkasPanggilan } from '../../lib/ringkasPanggilan';

export const GET: APIRoute = async ({ locals }) => {
  const pantau = pemantauanLayanan(locals.tokenAkses);
  try {
    const [agent, daftar] = await Promise.all([
      pantau.pantauAgent(),
      // Daftar panggilan yang gagal dibaca tidak boleh menutupi kesehatan komponen.
      pantau.panggilanBerjalan().catch(() => null),
    ]);
    // Ribuan panggilan dikirim sebagai jumlah per tahap ditambah beberapa contoh.
    const { panggilan, ringkasan } = ringkasPanggilan(daftar);
    return Response.json({ status: 'success', message: 'OK', data: { agent, panggilan, ringkasan } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    // PROJECT_RULES 5.10: hanya jenis galat, tanpa isi atau stack.
    console.error('pantau-agent', e instanceof Error ? e.name : 'unknown');
    return Response.json({ status: 'error', message: PESAN_PEMANTAUAN.panggilanGagalDimuat, data: null }, { status: 500 });
  }
};
