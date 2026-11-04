// Penyusun control UC-06 untuk endpoint dashboard. Dengan sesi Supabase, RPC penanganan dipanggil memakai token petugas
// agar RLS is_petugas() berlaku. Tanpa token (sesi tiruan untuk pengembangan lokal), dipakai penyimpanan tiruan, tidak
// pernah di build produksi: di sana konfigurasi yang hilang menjadi galat, bukan aksi tiruan yang tampak berhasil.
import { PenangananController } from './PenangananController.ts';
import { PenyimpananPenangananTiruan } from './mock/penangananTiruan.ts';
import { PenyimpananPenangananSupabase } from './penyimpananPenangananSupabase.ts';
import { bacaKonfigurasiSupabase } from './konfigurasiSupabase.ts';

// Satu instance tiruan per proses agar status tiket bertahan di antara permintaan sampai server dimulai ulang.
let tiruan: PenyimpananPenangananTiruan | undefined;

export function penanganan(tokenAkses: string | undefined, env: Record<string, string | undefined> = process.env) {
  const konfigurasi = bacaKonfigurasiSupabase(env);
  if (!(konfigurasi && tokenAkses) && !import.meta.env.PROD) return new PenangananController((tiruan ??= new PenyimpananPenangananTiruan()));
  return new PenangananController(
    new PenyimpananPenangananSupabase({ url: konfigurasi?.url ?? '', kunciPublik: konfigurasi?.kunciAnon ?? '', tokenAkses: tokenAkses ?? '' }),
  );
}
