// Penyusun control UC-08 untuk halaman dan endpoint dashboard. Dengan sesi Supabase, RPC dipanggil memakai token petugas
// sehingga hak ekspor diperiksa basis data. Tanpa token (sesi tiruan pengembangan lokal) dipakai penyimpanan tiruan, tidak
// pernah di build produksi: di sana konfigurasi yang hilang menjadi galat muat dan tanpa hak ekspor (BR-8).
import { LaporanController, type PenyimpananLaporan } from './LaporanController.ts';
import { PenyimpananLaporanSupabase } from './penyimpananLaporanSupabase.ts';
import { PenyimpananLaporanTiruan } from './mock/laporanTiruan.ts';
import { bacaKonfigurasiSupabase } from './konfigurasiSupabase.ts';

export function pilihPenyimpanan(tokenAkses: string | undefined, env: Record<string, string | undefined> = process.env): PenyimpananLaporan {
  const konfigurasi = bacaKonfigurasiSupabase(env);
  if (!(konfigurasi && tokenAkses) && !import.meta.env.PROD) return new PenyimpananLaporanTiruan();
  return new PenyimpananLaporanSupabase({ url: konfigurasi?.url ?? '', kunciPublik: konfigurasi?.kunciAnon ?? '', tokenAkses: tokenAkses ?? '' });
}

export const laporanLayanan = (tokenAkses: string | undefined) => new LaporanController(pilihPenyimpanan(tokenAkses));
