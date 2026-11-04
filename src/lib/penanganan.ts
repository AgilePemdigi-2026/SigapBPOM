// Penyusun control UC-06 untuk endpoint dashboard. Dengan sesi Supabase, RPC penanganan dipanggil memakai token petugas
// agar RLS is_petugas() berlaku. Tanpa token (sesi tiruan untuk pengembangan lokal), dipakai penyimpanan tiruan.
import { PenangananController } from './PenangananController.ts';
import { PenyimpananPenangananTiruan } from './mock/penangananTiruan.ts';
import { PenyimpananPenangananSupabase } from './penyimpananPenangananSupabase.ts';
import { bacaKonfigurasiSupabase } from './konfigurasiSupabase.ts';

// Satu instance tiruan per proses agar status tiket bertahan di antara permintaan sampai server dimulai ulang.
const tiruan = new PenyimpananPenangananTiruan();

export function penanganan(tokenAkses: string | undefined, env: Record<string, string | undefined> = process.env) {
  const konfigurasi = bacaKonfigurasiSupabase(env);
  return new PenangananController(
    konfigurasi && tokenAkses ? new PenyimpananPenangananSupabase({ url: konfigurasi.url, kunciPublik: konfigurasi.kunciAnon, tokenAkses }) : tiruan,
  );
}
