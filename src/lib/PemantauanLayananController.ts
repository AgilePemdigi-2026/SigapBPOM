// Control UC-04 Memantau Layanan: ringkasan layanan (REQ-4.1, T-F5.1-02), panggilan berjalan (REQ-4.2, T-F5.2-01),
// dan pantau AI Agent (T-F5.4-01).

export type JenisInteraksi = 'informasi_produk' | 'pengaduan';
export type JenisTiket = 'pengaduan' | 'eskalasi';
export type StatusTiket = 'belum_ditelaah' | 'sedang_ditelaah' | 'menunggu_pemeriksaan' | 'tanggapan_disusun' | 'selesai' | 'diteruskan';
/** Tahap pemrosesan AI yang dilaporkan Voice Gateway (T-F5.2-02). */
export type TahapAi = 'mendengar' | 'memproses' | 'menjawab';

/** Angka mentah ringkasan, dihitung di zona Asia/Jakarta. */
export type StatistikTersimpan = {
  panggilanHariIni: number;
  dijawabAi: number;
  tiketEskalasiBaru: number;
  tiketBelumDitelaah: number;
  pengaduanSelesai: number;
  panggilanBerjalan: number;
  /** Jumlah pertanyaan per kategori tujuh hari terakhir. */
  kategori: { kategori: string; jumlah: number }[];
};

/** Tiket yang belum ditelaah, untuk tabel Kasus Perlu Tindak Lanjut. tglTerbit berformat ISO 8601. */
export type KasusTersimpan = { noTiket: string; jenis: JenisTiket; ringkasan: string; tglTerbit: string };

/** Percakapan berstatus berjalan. noTelp sudah disamarkan di server (NFR-13, view penelepon_tersamar). */
export type PanggilanTersimpan = {
  id: string;
  noTelp: string | null;
  jenisInteraksi: JenisInteraksi | null;
  topik: string | null;
  waktuMulai: string;
  tahapAi: string | null;
};

/** Baris log_tool. Argumen tool sengaja tidak dibaca karena bisa memuat data pribadi. */
export type LogToolTersimpan = { id: number; namaTool: string; durasiMs: number; berhasil: boolean; waktu: string };

/** Penyimpanan data pemantauan (PROJECT_RULES 4.3): Supabase lewat sesi petugas, atau tiruan. */
export interface PenyimpananPemantauan {
  statistik(sekarang: Date): Promise<StatistikTersimpan>;
  /** Tiket belum ditelaah, terbaru lebih dulu. */
  kasusTindakLanjut(batas: number): Promise<KasusTersimpan[]>;
  /** Percakapan berstatus berjalan, terlama lebih dulu. */
  panggilanAktif(): Promise<PanggilanTersimpan[]>;
  /** Log tool terbaru lebih dulu. */
  logToolTerbaru(batas: number): Promise<LogToolTersimpan[]>;
}

/** Hasil pemeriksaan satu komponen AI Agent dari endpoint health Voice Gateway. */
export type KomponenTersimpan = { nama: string; sehat: boolean; latensiMs: number | null };

/** Layanan eksternal pemeriksa kesehatan AI Agent (PROJECT_RULES 4.3): endpoint health gateway, atau tiruan. */
export interface PemeriksaKesehatanAgent {
  periksa(): Promise<KomponenTersimpan[]>;
}

/** Kamus pesan PRD-rinci Lampiran A, UC-04. */
export const PESAN_PEMANTAUAN = { tidakAdaPanggilan: 'Tidak ada panggilan berjalan saat ini.' } as const;

export const LABEL_JENIS_INTERAKSI: Record<JenisInteraksi, string> = { informasi_produk: 'Informasi Produk', pengaduan: 'Pengaduan' };
export const LABEL_JENIS_TIKET: Record<JenisTiket, string> = { pengaduan: 'Pengaduan', eskalasi: 'Eskalasi AI' };
export const LABEL_STATUS_TIKET: Record<StatusTiket, string> = {
  belum_ditelaah: 'Belum Ditelaah',
  sedang_ditelaah: 'Sedang Ditelaah',
  menunggu_pemeriksaan: 'Menunggu Pemeriksaan',
  tanggapan_disusun: 'Tanggapan Disusun',
  selesai: 'Selesai',
  diteruskan: 'Diteruskan ke Instansi Lain',
};
const LABEL_TAHAP_AI: Record<TahapAi, string> = { mendengar: 'Mendengar', memproses: 'Memproses', menjawab: 'Menjawab' };

/** Komponen yang selalu tampil di halaman pantau, meski gateway tidak melaporkannya (T-F5.4-01). */
export const KOMPONEN_AGENT = ['Voice Gateway', 'Hermes', 'STT/TTS', 'cekbpom'] as const;

// REQ-4.1: tabel Kasus Perlu Tindak Lanjut di ringkasan memuat beberapa tiket teratas saja.
export const BATAS_KASUS_RINGKASAN = 3;
export const BATAS_LOG_TOOL = 20;
// Kartu "pemakaian saluran" membandingkan panggilan aktif dengan kapasitas saluran Voice Gateway.
export const KAPASITAS_SALURAN_BAWAAN = 10;

const DETIK = 1000;
// REQ-4.1: persentase kategori dan pengaduan selesai dihitung atas tujuh hari terakhir.
export const HARI_KATEGORI = 7;

/** Awal hari ini di zona Asia/Jakarta, dalam ISO 8601. Statistik "hari ini" dihitung sejak titik ini. */
export function awalHariWib(sekarang: Date): string {
  const tgl = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(sekarang);
  return `${tgl}T00:00:00+07:00`;
}

/** Awal hari WIB, mundur sejumlah hari; dipakai untuk jendela tujuh hari terakhir termasuk hari ini. */
export function awalHariWibMundur(sekarang: Date, hari: number): string {
  return new Date(new Date(awalHariWib(sekarang)).getTime() - (hari - 1) * 24 * 60 * 60 * DETIK).toISOString();
}

export type Ringkasan = {
  statistik: StatistikTersimpan;
  kategori: { label: string; persen: number }[];
  kasus: { noTiket: string; ringkasan: string; jenis: string; waktu: string; menunggu: string }[];
};

export type Panggilan = { id: string; noTelp: string; jenis: string; topik: string; waktuMulai: string; tahap: string };

export type RingkasanPanggilan = { aktif: number; rataDurasiDetik: number; terlamaDetik: number; pemakaianSaluranPersen: number };

export type StatusKomponen = { nama: string; status: 'Normal' | 'Gangguan'; latensiMs: number | null };

export type LogTool = { id: number; namaTool: string; durasiMs: number; hasil: 'Berhasil' | 'Gagal'; waktu: string };

export type PantauAgent = { komponen: StatusKomponen[]; rataLatensiToolMs: number | null; log: LogTool[] };

const jamTampil = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso)).replace(/\./g, ':');

/** Lama menunggu sejak tiket terbit, dibulatkan ke satuan terbesar. */
export function lamaMenunggu(iso: string, sekarang: Date): string {
  const menit = Math.max(0, Math.floor((sekarang.getTime() - new Date(iso).getTime()) / (60 * DETIK)));
  if (menit < 60) return `${menit} menit`;
  if (menit < 24 * 60) return `${Math.floor(menit / 60)} jam`;
  return `${Math.floor(menit / (24 * 60))} hari`;
}

/** Persentase per kategori dibulatkan; urut dari yang terbanyak. */
export function persenKategori(kategori: StatistikTersimpan['kategori']) {
  const total = kategori.reduce((n, k) => n + k.jumlah, 0);
  if (!total) return [];
  return [...kategori]
    .sort((a, b) => b.jumlah - a.jumlah || a.kategori.localeCompare(b.kategori, 'id'))
    .map((k) => ({ label: k.kategori, persen: Math.round((k.jumlah / total) * 100) }));
}

export function ringkasPanggilan(panggilan: Panggilan[], sekarang: Date, kapasitas = KAPASITAS_SALURAN_BAWAAN): RingkasanPanggilan {
  const durasi = panggilan.map((p) => Math.max(0, Math.floor((sekarang.getTime() - new Date(p.waktuMulai).getTime()) / DETIK)));
  const total = durasi.reduce((n, d) => n + d, 0);
  return {
    aktif: panggilan.length,
    rataDurasiDetik: durasi.length ? Math.round(total / durasi.length) : 0,
    terlamaDetik: durasi.length ? Math.max(...durasi) : 0,
    pemakaianSaluranPersen: Math.min(100, Math.round((panggilan.length / Math.max(1, kapasitas)) * 100)),
  };
}

export class PemantauanLayananController {
  penyimpanan: PenyimpananPemantauan;
  kesehatan: PemeriksaKesehatanAgent;

  constructor(penyimpanan: PenyimpananPemantauan, kesehatan: PemeriksaKesehatanAgent) {
    this.penyimpanan = penyimpanan;
    this.kesehatan = kesehatan;
  }

  /** REQ-4.1: statistik hari ini, kasus perlu tindak lanjut, jumlah panggilan berjalan, kategori 7 hari terakhir. */
  async ringkasanLayanan(sekarang = new Date()): Promise<Ringkasan> {
    const [statistik, kasus] = await Promise.all([this.penyimpanan.statistik(sekarang), this.penyimpanan.kasusTindakLanjut(BATAS_KASUS_RINGKASAN)]);
    return {
      statistik,
      kategori: persenKategori(statistik.kategori),
      kasus: kasus.map((k) => ({
        noTiket: k.noTiket,
        ringkasan: k.ringkasan,
        jenis: LABEL_JENIS_TIKET[k.jenis],
        waktu: jamTampil(k.tglTerbit),
        menunggu: lamaMenunggu(k.tglTerbit, sekarang),
      })),
    };
  }

  /** REQ-4.2: panggilan aktif dengan nomor tersamar; nomor yang tidak tersamar tidak pernah diteruskan ke halaman. */
  async panggilanBerjalan(): Promise<Panggilan[]> {
    const baris = await this.penyimpanan.panggilanAktif();
    return baris.map((p) => ({
      id: p.id,
      noTelp: p.noTelp && p.noTelp.includes('*') ? p.noTelp : '—',
      jenis: p.jenisInteraksi ? LABEL_JENIS_INTERAKSI[p.jenisInteraksi] : 'Memilih layanan',
      topik: p.topik ?? '—',
      waktuMulai: p.waktuMulai,
      tahap: Object.hasOwn(LABEL_TAHAP_AI, p.tahapAi ?? '') ? LABEL_TAHAP_AI[p.tahapAi as TahapAi] : '—',
    }));
  }

  /** T-F5.4-01: kesehatan komponen, rata-rata latensi tool, dan log tool terbaru. */
  async pantauAgent(): Promise<PantauAgent> {
    const [hasil, log] = await Promise.all([
      // Gateway tidak terjangkau berarti semua komponen di belakangnya tidak bisa dipastikan sehat.
      this.kesehatan.periksa().catch((): KomponenTersimpan[] => []),
      // Log yang gagal dibaca tidak boleh menutupi status komponen.
      this.penyimpanan.logToolTerbaru(BATAS_LOG_TOOL).catch((): LogToolTersimpan[] => []),
    ]);
    const perNama = new Map(hasil.map((k) => [k.nama, k]));
    const komponen = [...KOMPONEN_AGENT, ...hasil.map((k) => k.nama).filter((n) => !(KOMPONEN_AGENT as readonly string[]).includes(n))].map(
      (nama): StatusKomponen => {
        const k = perNama.get(nama);
        return { nama, status: k?.sehat ? 'Normal' : 'Gangguan', latensiMs: k?.latensiMs ?? null };
      },
    );
    const urut = [...log].sort((a, b) => b.waktu.localeCompare(a.waktu) || b.id - a.id);
    return {
      komponen,
      rataLatensiToolMs: urut.length ? Math.round(urut.reduce((n, l) => n + l.durasiMs, 0) / urut.length) : null,
      log: urut.map((l) => ({ id: l.id, namaTool: l.namaTool, durasiMs: l.durasiMs, hasil: l.berhasil ? 'Berhasil' : 'Gagal', waktu: jamTampil(l.waktu) })),
    };
  }
}
