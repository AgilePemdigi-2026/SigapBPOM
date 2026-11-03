// Boundary UC-07: meneruskan permintaan simpan materi ke Edge Function `simpan-materi` dengan token sesi petugas.
// Token akses berada di cookie HttpOnly, jadi JavaScript browser tidak pernah memegangnya; server yang melampirkannya
// sebagai Authorization: Bearer. Middleware sudah memastikan sesi sah (locals.tokenAkses terisi).
import type { APIRoute } from 'astro';
import { bacaKonfigurasiSupabase } from '../../lib/konfigurasiSupabase.ts';

const BATAS_BYTE = 256 * 1024;
const PESAN_SISTEM = 'Terjadi kesalahan pada sistem.';
const galat = (kode: number, message: string) => Response.json({ status: 'error', message, data: null }, { status: kode });

export const POST: APIRoute = async ({ request, locals }) => {
  const token = locals.tokenAkses;
  if (!token) return galat(401, 'Akses ditolak.');
  const konfigurasi = bacaKonfigurasiSupabase();
  if (!konfigurasi) return galat(500, PESAN_SISTEM);

  const isi = await request.text().catch(() => '');
  if (!isi || Buffer.byteLength(isi) > BATAS_BYTE) return galat(400, 'Permintaan tidak valid.');

  try {
    const res = await fetch(`${konfigurasi.url}/functions/v1/simpan-materi`, {
      method: 'POST',
      headers: { apikey: konfigurasi.kunciAnon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: isi,
      signal: AbortSignal.timeout(30_000),
    });
    // Galat 5xx (termasuk halaman galat gateway Supabase yang bukan JSON) tidak diteruskan apa adanya (PROJECT_RULES 5.12).
    if (res.status >= 500) return galat(500, PESAN_SISTEM);
    return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return galat(500, PESAN_SISTEM);
  }
};
