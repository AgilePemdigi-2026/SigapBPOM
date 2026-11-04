// Penyusun control UC-07 untuk halaman dan endpoint dashboard.
// Materi dibaca dan diubah memakai token petugas agar RLS is_petugas() berlaku. Tanpa token (sesi tiruan untuk
// pengembangan lokal) dipakai penyimpanan tiruan, tidak pernah di build produksi.
import { BasisPengetahuanController, type PenyimpananMateri } from './BasisPengetahuanController.ts';
import { PenyimpananMateriTiruan } from './mock/materiTiruan.ts';
import { PenyimpananMateriSupabase } from './penyimpananMateriSupabase.ts';
import { bacaKonfigurasiSupabase } from './konfigurasiSupabase.ts';

function pilihPenyimpanan(tokenAkses: string | undefined): PenyimpananMateri {
  const konfigurasi = bacaKonfigurasiSupabase();
  if (!(konfigurasi && tokenAkses) && !import.meta.env.PROD) return new PenyimpananMateriTiruan();
  return new PenyimpananMateriSupabase({ url: konfigurasi?.url ?? '', kunciPublik: konfigurasi?.kunciAnon ?? '', tokenAkses: tokenAkses ?? '' });
}

export const basisPengetahuan = (tokenAkses: string | undefined) => new BasisPengetahuanController(pilihPenyimpanan(tokenAkses));
