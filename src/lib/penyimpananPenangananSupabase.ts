// Adapter produksi PenyimpananPenanganan (T-F7.2-03): PenyimpananPenangananSupabase dari PenangananController (T-F7.1-01,
// T-F7.2-01) dijalankan di atas klien RPC REST bertoken sesi petugas, sehingga pemeriksaan is_petugas() di RPC berlaku.
// Dashboard tidak pernah memakai service_role.
import { PenyimpananPenangananSupabase } from './PenangananController.ts';

type OpsiKlien = { url: string; kunciPublik: string; tokenAkses: string; fetch?: typeof fetch };

/** Galat RPC: `code` berisi SQLSTATE dari PostgREST (misalnya SGBR2), kosong bila jawaban bukan galat PostgREST. */
export type GalatRpc = Error & { code?: string };

/** Klien minimal berbentuk `supabase.rpc()` di atas REST Supabase, cukup untuk adapter UC-06. */
export function klienRpcRest(opsi: OpsiKlien) {
  const url = opsi.url.replace(/\/+$/, '');
  const f = opsi.fetch ?? globalThis.fetch;
  return {
    async rpc(nama: string, argumen: Record<string, unknown> = {}) {
      const res = await f(`${url}/rest/v1/rpc/${nama}`, {
        method: 'POST',
        headers: { apikey: opsi.kunciPublik, Authorization: `Bearer ${opsi.tokenAkses}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(argumen),
      });
      const isi: unknown = await res.json().catch(() => null);
      if (res.ok) return { data: isi, error: null };
      const galat: GalatRpc = new Error(`Supabase ${res.status} pada rpc/${nama}`);
      galat.code = (isi as { code?: unknown } | null)?.code as string | undefined;
      return { data: null, error: galat };
    },
  };
}

export const penyimpananPenangananSupabase = (opsi: OpsiKlien) => new PenyimpananPenangananSupabase(klienRpcRest(opsi));
