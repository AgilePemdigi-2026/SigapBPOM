// Control UC-07 Mengelola Basis Pengetahuan: daftar materi (T-F2.1-03) dan graf pengetahuan (REQ-7.4, T-F2.4-02).

export type StatusMateri = 'aktif' | 'tidak_aktif';

/** Satu baris materi_pengetahuan. diperbaruiPada berformat ISO 8601. */
export type MateriTersimpan = {
  id: string;
  judul: string;
  kategori: string;
  rujukanSumber: string;
  status: StatusMateri;
  diperbaruiPada: string;
};

export type KueriPenyimpanan = { status?: StatusMateri; cari?: string; offset: number; batas: number };

/** Penyimpanan materi (PROJECT_RULES 4.3): Supabase lewat sesi petugas, atau tiruan dari korpus RAG. */
export interface PenyimpananMateri {
  /** Satu halaman materi, terbaru lebih dulu, beserta jumlah seluruh materi yang cocok dengan filter. */
  daftar(kueri: KueriPenyimpanan): Promise<{ baris: MateriTersimpan[]; total: number }>;
  /** Potongan teks terindeks per materi, untuk detail simpul graf. */
  potongan(materiIds: string[]): Promise<Record<string, string[]>>;
}

/** Bentuk baris tabel di halaman Basis Pengetahuan. */
export type Materi = { id: string; judul: string; kategori: string; rujukan: string; tgl: string; aktif: boolean };

export type Simpul = { id: string; label: string; x: number; y: number; r: number; hub?: boolean; rujukan: string; bagian: string[]; links: number };

export type Graf = { simpul: Simpul[]; sisi: [string, string][] };

export type KueriMateri = { status?: unknown; cari?: unknown; halaman?: unknown; ukuran?: unknown };

/** Kamus pesan PRD-rinci Lampiran A, UC-07. */
export const PESAN_MATERI = { gagalDimuat: 'Materi gagal dimuat. Muat ulang halaman untuk mencoba lagi.' } as const;

export const UKURAN_HALAMAN_BAWAAN = 25;
// ponytail: halaman dan graf membaca paling banyak 1000 materi sekaligus; tambah paginasi di UI bila korpus melewatinya.
export const UKURAN_HALAMAN_MAKS = 1000;
// PROJECT_RULES 5.6: panjang isian dibatasi sebelum diteruskan ke basis data.
const PANJANG_CARI_MAKS = 100;

// Graf dibatasi agar tetap terbaca di kanvas: simpul kategori sebagai pusat, beberapa materi terbaru di sekelilingnya.
const MATERI_PER_KATEGORI = 5;
const BAGIAN_PER_SIMPUL = 3;
const PANJANG_BAGIAN = 140;
const PANJANG_LABEL = 22;
const R_HUB = 46;
const R_MATERI = 34;
const JARAK_HUB = 30;
const JARAK_MATERI = 13;

const tglTampil = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)).replace('.', '');

const potong = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function keTampilan(m: MateriTersimpan): Materi {
  return { id: m.id, judul: m.judul, kategori: m.kategori, rujukan: m.rujukanSumber, tgl: tglTampil(m.diperbaruiPada), aktif: m.status === 'aktif' };
}

const bulat = (n: number) => Math.round(n * 10) / 10;

/** Graf dari materi aktif: setiap materi tersambung ke kategorinya dan ke materi lain dengan rujukan sumber yang sama. */
export function susunGraf(materi: MateriTersimpan[], potongan: Record<string, string[]>): Graf {
  const perKategori = new Map<string, MateriTersimpan[]>();
  for (const m of materi) {
    const anggota = perKategori.get(m.kategori) ?? [];
    if (anggota.length < MATERI_PER_KATEGORI) anggota.push(m);
    perKategori.set(m.kategori, anggota);
  }

  const simpul: Simpul[] = [];
  const sisi: [string, string][] = [];
  const kategori = [...perKategori.keys()];
  kategori.forEach((k, i) => {
    const sudut = (2 * Math.PI * i) / kategori.length - Math.PI / 2;
    const hx = 50 + JARAK_HUB * Math.cos(sudut);
    const hy = 50 + JARAK_HUB * Math.sin(sudut);
    const anggota = perKategori.get(k)!;
    const hub = `kategori:${k}`;
    simpul.push({ id: hub, label: k, x: bulat(hx), y: bulat(hy), r: R_HUB, hub: true, rujukan: `Kategori ${k}`, bagian: anggota.map((m) => m.judul), links: 0 });
    anggota.forEach((m, j) => {
      // Materi disebar di sisi luar kategori agar tidak menumpuk di tengah kanvas.
      const a = sudut + ((j - (anggota.length - 1) / 2) * Math.PI) / 4;
      simpul.push({
        id: m.id,
        label: potong(m.judul, PANJANG_LABEL),
        x: bulat(Math.min(94, Math.max(6, hx + JARAK_MATERI * Math.cos(a)))),
        y: bulat(Math.min(92, Math.max(8, hy + JARAK_MATERI * Math.sin(a)))),
        r: R_MATERI,
        rujukan: m.rujukanSumber,
        bagian: (potongan[m.id] ?? []).slice(0, BAGIAN_PER_SIMPUL).map((t) => potong(t.trim(), PANJANG_BAGIAN)),
        links: 0,
      });
      sisi.push([hub, m.id]);
    });
  });

  // Rujukan bersama dirangkai berurutan, bukan semua pasangan, agar sisi tidak meledak untuk rujukan yang umum.
  const terakhirPerRujukan = new Map<string, string>();
  for (const m of [...perKategori.values()].flat()) {
    const sebelumnya = terakhirPerRujukan.get(m.rujukanSumber);
    if (sebelumnya) sisi.push([sebelumnya, m.id]);
    terakhirPerRujukan.set(m.rujukanSumber, m.id);
  }

  const derajat = new Map<string, number>();
  for (const [a, b] of sisi) {
    derajat.set(a, (derajat.get(a) ?? 0) + 1);
    derajat.set(b, (derajat.get(b) ?? 0) + 1);
  }
  for (const n of simpul) n.links = derajat.get(n.id) ?? 0;
  return { simpul, sisi };
}

export class BasisPengetahuanController {
  penyimpanan: PenyimpananMateri;

  constructor(penyimpanan: PenyimpananMateri) {
    this.penyimpanan = penyimpanan;
  }

  /** Daftar materi dengan filter status, pencarian judul atau rujukan, dan paginasi di server. */
  async daftarMateri(kueri: KueriMateri = {}): Promise<{ materi: Materi[]; total: number } | { gagal: string }> {
    const ukuran = Math.min(UKURAN_HALAMAN_MAKS, Math.max(1, Math.trunc(Number(kueri.ukuran)) || UKURAN_HALAMAN_BAWAAN));
    const halaman = Math.max(1, Math.trunc(Number(kueri.halaman)) || 1);
    const status = kueri.status === 'aktif' || kueri.status === 'tidak_aktif' ? kueri.status : undefined;
    const cari = typeof kueri.cari === 'string' ? kueri.cari.trim().slice(0, PANJANG_CARI_MAKS) : '';
    try {
      const { baris, total } = await this.penyimpanan.daftar({ status, cari: cari || undefined, offset: (halaman - 1) * ukuran, batas: ukuran });
      return { materi: baris.map(keTampilan), total };
    } catch {
      return { gagal: PESAN_MATERI.gagalDimuat };
    }
  }

  /** REQ-7.4: graf hanya memuat materi aktif, karena materi tidak aktif tidak lagi dipakai sebagai sumber jawaban (BR-5). */
  async grafPengetahuan(): Promise<Graf | { gagal: string }> {
    try {
      const { baris } = await this.penyimpanan.daftar({ status: 'aktif', offset: 0, batas: UKURAN_HALAMAN_MAKS });
      const awal = susunGraf(baris, {});
      const ids = awal.simpul.filter((n) => !n.hub).map((n) => n.id);
      return susunGraf(baris, await this.penyimpanan.potongan(ids));
    } catch {
      return { gagal: PESAN_MATERI.gagalDimuat };
    }
  }
}
