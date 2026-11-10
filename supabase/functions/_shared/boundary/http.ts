// Boundary bersama Edge Functions: kunci internal, parsing JSON, format respons standar (PROJECT_RULES 4.4).
import { timingSafeEqual } from 'node:crypto';
import { ErrorSigap } from '../control/InformasiProdukController.ts';

const kirim = (kode: number, status: 'success' | 'error', message: string, data: unknown = null) =>
  Response.json({ status, message, data }, { status: kode });

type Kunci = { nama: string; opsional?: boolean };

// Fungsi ini dipanggil server ke server, bukan browser, jadi tidak ada header CORS: Voice Gateway dan Hermes Agent dengan
// SIGAP_KUNCI_INTERNAL, server dashboard (fungsi login) dengan SIGAP_KUNCI_LOGIN. Gagal tertutup bila kunci belum
// diatur, kecuali kunci opsional.
function kunciSah(req: Request, { nama, opsional = false }: Kunci): boolean {
  const kunci = Deno.env.get(nama);
  if (!kunci) return opsional;
  const dikirim = req.headers.get('x-sigap-kunci');
  if (!dikirim) return false;
  const a = new TextEncoder().encode(kunci), b = new TextEncoder().encode(dikirim);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function layani(
  proses: (body: Record<string, unknown>) => Promise<unknown>,
  kunci: Kunci = { nama: 'SIGAP_KUNCI_INTERNAL' },
) {
  Deno.serve(async (req) => {
    if (req.method !== 'POST') return kirim(405, 'error', 'Metode tidak didukung.');
    if (!kunciSah(req, kunci)) return kirim(401, 'error', 'Akses ditolak.');
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return kirim(400, 'error', 'Permintaan tidak valid.');
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return kirim(400, 'error', 'Permintaan tidak valid.');
    try {
      return kirim(200, 'success', 'OK', await proses(body as Record<string, unknown>));
    } catch (e) {
      if (e instanceof ErrorSigap) return kirim(e.status, 'error', e.message);
      // Galat PostgREST berupa objek biasa; kodenya (misalnya PGRST202 bila migrasi belum diterapkan) aman dicatat.
      console.error('galat tak terduga', e instanceof Error ? e.name : (e as { code?: string } | null)?.code ?? 'unknown');
      return kirim(500, 'error', 'Terjadi kesalahan pada sistem.');
    }
  });
}
