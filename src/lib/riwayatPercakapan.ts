// Penyusun control UC-05 untuk halaman Riwayat Percakapan. Dengan token sesi Supabase, riwayat dibaca memakai token
// petugas agar is_petugas() berlaku. Penyimpanan tiruan hanya untuk jalur tanpa token (sesi tiruan pengembangan lokal),
// jadi sesi nyata tidak pernah melihat data tiruan meski konfigurasi Supabase hilang.
import { TranskripController, type PenyimpananRiwayat } from './TranskripController.ts';
import { PenyimpananRiwayatSupabase } from './penyimpananRiwayatSupabase.ts';
import { PenyimpananRiwayatTiruan } from './mock/riwayatTiruan.ts';
import { bacaKonfigurasiSupabase } from './konfigurasiSupabase.ts';

export function pilihPenyimpananRiwayat(tokenAkses: string | undefined, env: Record<string, string | undefined> = process.env): PenyimpananRiwayat {
  if (!tokenAkses) return new PenyimpananRiwayatTiruan();
  const konfigurasi = bacaKonfigurasiSupabase(env);
  return new PenyimpananRiwayatSupabase({ url: konfigurasi?.url ?? '', kunciPublik: konfigurasi?.kunciAnon ?? '', tokenAkses });
}

export const transkrip = (tokenAkses: string | undefined) => new TranskripController(pilihPenyimpananRiwayat(tokenAkses));
