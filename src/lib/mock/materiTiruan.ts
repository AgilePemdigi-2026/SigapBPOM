// Materi tiruan dari manifest korpus RAG yang dipakai Voice Gateway. Juga sumber seed materi (scripts/seed-materi.ts).
import regulasiBpom from '../../../knowledge/regulasi-bpom/manifest.json' with { type: 'json' };
import regulasiTerkait from '../../../knowledge/regulasi-terkait/manifest.json' with { type: 'json' };
import edukasiBpom from '../../../knowledge/edukasi-bpom/manifest.json' with { type: 'json' };
import type { KueriPenyimpanan, MateriTersimpan, PenyimpananMateri } from '../BasisPengetahuanController.ts';

// Kategori ditebak dari judul; urutan penting karena "Obat Tradisional" juga mengandung "Obat".
const POLA_KATEGORI: [RegExp, string][] = [
  [/kosmetik/i, 'Kosmetik'],
  [/suplemen/i, 'Suplemen Kesehatan'],
  [/obat tradisional|obat bahan alam|fitofarmaka/i, 'Obat Tradisional'],
  [/pangan|gizi|makanan|minuman|perisa/i, 'Pangan Olahan'],
  [/obat|farmakovigilans|vaksin|narkotika|psikotropika/i, 'Obat'],
];
const kategoriDari = (judul: string) => POLA_KATEGORI.find(([pola]) => pola.test(judul))?.[1] ?? 'Edukasi Umum';

type DokumenManifest = { file: string; title: string; bentuk: string; tahun: string; nomor?: string; tanggal?: string };

/** Dokumen korpus beserta letak berkasnya, relatif terhadap akar repo. */
export type DokumenKorpus = Omit<MateriTersimpan, 'id' | 'status'> & { berkas: string };

const dari = (folder: string, dokumen: DokumenManifest[]): DokumenKorpus[] =>
  dokumen.map((d) => ({
    berkas: `knowledge/${folder}/${d.file}`,
    judul: d.title,
    kategori: kategoriDari(d.title),
    // Peraturan dirujuk dengan nomor dan tahun; informasi publik BPOM dengan bentuknya.
    rujukanSumber: d.nomor ? `${d.bentuk} No. ${d.nomor} Tahun ${d.tahun}` : d.bentuk,
    // Tanggal terbit dipakai sebagai waktu pemutakhiran; peraturan tanpa tanggal memakai awal tahunnya.
    diperbaruiPada: `${d.tanggal ?? `${d.tahun}-01-01`}T00:00:00+07:00`,
  }));

export const DOKUMEN_KORPUS: DokumenKorpus[] = [
  ...dari('regulasi-bpom', regulasiBpom.dokumen),
  ...dari('regulasi-terkait', regulasiTerkait.dokumen),
  ...dari('edukasi-bpom', edukasiBpom.dokumen),
];

const terbaru = (a: MateriTersimpan, b: MateriTersimpan) =>
  b.diperbaruiPada.localeCompare(a.diperbaruiPada) || a.judul.localeCompare(b.judul, 'id');

export const MATERI_TIRUAN: MateriTersimpan[] = DOKUMEN_KORPUS.map(({ berkas, ...d }, i) => ({ ...d, id: `tiruan-${i + 1}`, status: 'aktif' as const })).sort(terbaru);

export class PenyimpananMateriTiruan implements PenyimpananMateri {
  materi: MateriTersimpan[];

  constructor(materi: MateriTersimpan[] = MATERI_TIRUAN) {
    this.materi = materi;
  }

  async daftar({ status, cari, offset, batas }: KueriPenyimpanan) {
    const q = cari?.toLowerCase();
    const cocok = this.materi.filter((m) => (!status || m.status === status) && (!q || `${m.judul} ${m.rujukanSumber}`.toLowerCase().includes(q)));
    return { baris: cocok.slice(offset, offset + batas), total: cocok.length };
  }

  async potongan() {
    return {};
  }
}
