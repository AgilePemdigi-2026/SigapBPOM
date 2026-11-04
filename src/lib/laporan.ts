// Penyusun control UC-08 untuk halaman dan endpoint dashboard. Dengan sesi Supabase, RPC dipanggil memakai token petugas
// sehingga hak ekspor diperiksa basis data. Tanpa token (sesi tiruan pengembangan lokal) dipakai penyimpanan tiruan, yang
// tidak pernah memberi hak ekspor di build produksi (BR-8).
import { LaporanController, type PenyimpananLaporan } from './LaporanController.ts';
import { PenyimpananLaporanSupabase } from './penyimpananLaporanSupabase.ts';
import { PenyimpananLaporanTiruan } from './mock/laporanTiruan.ts';
import { bacaKonfigurasiSupabase } from './konfigurasiSupabase.ts';

export function pilihPenyimpanan(
  tokenAkses: string | undefined,
  env: Record<string, string | undefined> = process.env,
  produksi: boolean = import.meta.env.PROD,
): PenyimpananLaporan {
  const konfigurasi = bacaKonfigurasiSupabase(env);
  return konfigurasi && tokenAkses
    ? new PenyimpananLaporanSupabase({ url: konfigurasi.url, kunciPublik: konfigurasi.kunciAnon, tokenAkses })
    : new PenyimpananLaporanTiruan({ hakEkspor: !produksi });
}

export const laporanLayanan = (tokenAkses: string | undefined) => new LaporanController(pilihPenyimpanan(tokenAkses));
