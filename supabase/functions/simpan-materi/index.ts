// Boundary UC-07: Edge Function `simpan-materi` untuk menambah materi pengetahuan (T-F2.2-02, REQ-7.1, REQ-7.2, BR-4).
// POST { judul, kategori?, isi?, rujukan } -> { status, message, data: MateriPengetahuan }
import { buatPenyediaEmbedding } from '../_shared/adapter/embedding.ts';
import { PenyimpananPengetahuanSupabase } from '../_shared/adapter/penyimpananPengetahuan.ts';
import {
  BasisPengetahuanController,
  PESAN_MATERI_TERSIMPAN,
} from '../_shared/control/BasisPengetahuanController.ts';
import { ErrorSigap } from '../_shared/control/InformasiProdukController.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sigap-kunci',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const kirim = (kode: number, status: 'success' | 'error', message: string, data: unknown = null) =>
  new Response(JSON.stringify({ status, message, data }), {
    status: kode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const controller = new BasisPengetahuanController(
  buatPenyediaEmbedding(),
  new PenyimpananPengetahuanSupabase(),
);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return kirim(405, 'error', 'Metode tidak didukung.');
  }

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
    const hasil = await controller.tambahMateri(body as Record<string, unknown>);
    return kirim(200, 'success', PESAN_MATERI_TERSIMPAN, hasil);
  } catch (e) {
    if (e instanceof ErrorSigap) {
      return kirim(e.status, 'error', e.message);
    }
    console.error('galat tak terduga simpan-materi:', e instanceof Error ? e.name : 'unknown');
    return kirim(500, 'error', 'Terjadi kesalahan pada sistem.');
  }
});
