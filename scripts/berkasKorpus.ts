// Mencari berkas korpus di knowledge/ untuk materi yang diindeks ulang oleh scripts/indeks-materi.ts (T-F2.2-02, REQ-7.1).
import type { DokumenKorpus } from '../src/lib/mock/materiTiruan.ts';
import { kunciMateri } from '../voice-gateway/pengetahuan.mjs';

/**
 * Judul dan rujukan saja tidak unik di korpus (dokumen senama dari tahun berbeda), jadi tautan sumber ikut dicocokkan.
 * Materi tanpa url_sumber memakai satu-satunya dokumen dengan judul dan rujukan itu. Hasilnya undefined bila materi
 * bukan dari korpus, dan null bila dari korpus tetapi berkasnya tidak bisa dipastikan.
 */
export function pemetaBerkasKorpus(korpus: Pick<DokumenKorpus, 'judul' | 'rujukanSumber' | 'urlSumber' | 'berkas'>[]) {
  const perKunci = Map.groupBy(korpus, (d) => kunciMateri(d.judul, d.rujukanSumber));
  return (judul: string, rujukan: string, urlSumber: string | null) => {
    const calon = perKunci.get(kunciMateri(judul, rujukan));
    if (!calon) return undefined;
    const dokumen = calon.find((d) => d.urlSumber === urlSumber) ?? (urlSumber === null && calon.length === 1 ? calon[0] : undefined);
    return dokumen?.berkas ?? null;
  };
}
