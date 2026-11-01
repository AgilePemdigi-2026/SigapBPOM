// Boundary UC-07: Edge Function `simpan-materi` untuk menambah materi pengetahuan (T-F2.2-02, REQ-7.1, REQ-7.2, BR-4).
// POST { judul, kategori?, isi?, rujukan } + Authorization: Bearer <token sesi petugas>
//   -> { status, message, data: MateriPengetahuan }
// Penulisan memakai token petugas, bukan service_role, sehingga RLS is_petugas() berlaku (PROJECT_RULES 5.4).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { buatPenyediaEmbedding } from '../_shared/adapter/embedding.ts';
import { PenyimpananPengetahuanSupabase } from '../_shared/adapter/penyimpananPengetahuan.ts';
import {
  BasisPengetahuanController,
  PESAN_MATERI_TERSIMPAN,
} from '../_shared/control/BasisPengetahuanController.ts';
import { ErrorSigap } from '../_shared/control/InformasiProdukController.ts';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL') ?? '';
const KUNCI_ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
// Origin dashboard yang boleh memanggil dari browser, dipisah koma. Kosong berarti tidak ada browser yang diizinkan.
const ASAL_DIIZINKAN = (Deno.env.get('SIGAP_ASAL_DASHBOARD') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const penyediaEmbedding = buatPenyediaEmbedding();

function headerCors(req: Request): Record<string, string> {
  const asal = req.headers.get('origin');
  if (!asal || !ASAL_DIIZINKAN.includes(asal)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': asal,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

Deno.serve(async (req: Request) => {
  const cors = headerCors(req);
  const kirim = (kode: number, status: 'success' | 'error', message: string, data: unknown = null) =>
    new Response(JSON.stringify({ status, message, data }), {
      status: kode,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method !== 'POST') {
    return kirim(405, 'error', 'Metode tidak didukung.');
  }

  // Hanya petugas yang login: token diverifikasi ke Supabase Auth, lalu keanggotaan petugas dicek.
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return kirim(401, 'error', 'Akses ditolak.');
  const db = createClient(URL_SUPABASE, KUNCI_ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: sesi, error: galatSesi } = await db.auth.getUser(token);
  if (galatSesi || !sesi.user) return kirim(401, 'error', 'Akses ditolak.');
  const { data: petugas, error: galatPeran } = await db.rpc('is_petugas');
  if (galatPeran || petugas !== true) return kirim(403, 'error', 'Akses ditolak.');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return kirim(400, 'error', 'Permintaan tidak valid.');
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return kirim(400, 'error', 'Permintaan tidak valid.');
  }

  try {
    const controller = new BasisPengetahuanController(penyediaEmbedding, new PenyimpananPengetahuanSupabase(db));
    // Pengubah diambil dari sesi yang terverifikasi, bukan dari isian permintaan.
    const hasil = await controller.tambahMateri({ ...(body as Record<string, unknown>), diperbarui_oleh: sesi.user.id });
    return kirim(200, 'success', PESAN_MATERI_TERSIMPAN, hasil);
  } catch (e) {
    if (e instanceof ErrorSigap) {
      return kirim(e.status, 'error', e.message);
    }
    console.error('galat tak terduga simpan-materi:', e instanceof Error ? e.name : 'unknown');
    return kirim(500, 'error', 'Terjadi kesalahan pada sistem.');
  }
});
