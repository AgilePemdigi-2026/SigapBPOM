// Control UC-04 Memantau Layanan: ringkasan layanan (REQ-4.1), panggilan berjalan (REQ-4.2), antrean tiket (REQ-4.3),
// detail kasus (REQ-4.4), dan pantau AI Agent (T-F5.4-01).

export type StatistikLayanan = {
  panggilanHariIni: number;
  jawabanOtomatisAi: number;
  tiketEskalasiBaru: number;
  pengaduanSelesai: number;
  panggilanBerjalan: number;
};

export type PersentaseKategori = {
  kategori: string;
  jumlah: number;
  persentase: number;
};

export type KasusPerluTindakLanjut = {
  id: string;
  noTiket: string;
  jenis: 'pengaduan' | 'eskalasi';
  ringkasan: string;
  status: string;
  tglTerbit: string;
  percakapanId?: string;
};

export type DataRingkasanLayanan = {
  statistik: StatistikLayanan;
  kategori: PersentaseKategori[];
  kasusPerluTindakLanjut: KasusPerluTindakLanjut[];
};

/** Percakapan berstatus berjalan. noTelp sudah disamarkan di server (NFR-13, view panggilan_berjalan). */
export interface PanggilanAktif {
  id: string;
  noTelp: string | null;
  jenisLayanan: string | null;
  topik: string | null;
  waktuMulai: string;
  durasiDetik: number;
  tahapAi: string | null;
}

export interface TiketAntrean {
  id: string;
  noTiket: string;
  jenis: 'pengaduan' | 'eskalasi';
  ringkasan: string;
  status: string;
  waktuMasuk: string;
  percakapanId?: string;
  noTelpTersamar?: string;
  namaPelaporTersamar?: string;
}

export type DetailKasusPengaduan = {
  tiketId: string;
  noTiket: string;
  jenis: 'pengaduan' | 'eskalasi';
  status: string;
  ringkasan: string;
  tglTerbit: string;
  percakapanId: string;
  pengaduanId?: string;
  namaProduk?: string;
  namaProdukDiadukan?: string;
  kronologi?: string;
  kelengkapan?: boolean;
  tglPengaduan?: string;
  namaPelaporTersamar?: string;
  noTelpTersamar?: string;
};

/** Jumlah percakapan per jam WIB (view beban_panggilan_per_jam); jam berformat 'YYYY-MM-DDTHH:00:00' tanpa zona. */
export type BebanPerJam = { jam: string; total: number; dijawabAi: number; dieskalasi: number };

/** Baris log_tool. Argumen tool sengaja tidak dibaca karena bisa memuat data pribadi. */
export type LogToolTersimpan = { id: number; namaTool: string; durasiMs: number; berhasil: boolean; waktu: string };

/** Penyimpanan pemantauan layanan (PROJECT_RULES 4.3): Supabase via RPC/view atau implementasi tiruan (mock). */
export interface PenyimpananPemantauan {
  ambilRingkasan(): Promise<DataRingkasanLayanan>;
  ambilStatistik?(): Promise<StatistikLayanan>;
  ambilPanggilanAktif?(): Promise<PanggilanAktif[]>;
  ambilAntreanTiket?(): Promise<TiketAntrean[]>;
  ambilDetailKasus?(noTiket: string): Promise<DetailKasusPengaduan | null>;
  /** Log tool terbaru lebih dulu. */
  ambilLogTool?(batas: number): Promise<LogToolTersimpan[]>;
  ambilBebanPerJam?(): Promise<BebanPerJam[]>;
}

/** Hasil pemeriksaan satu komponen AI Agent dari endpoint health Voice Gateway. */
export type KomponenTersimpan = { nama: string; sehat: boolean; latensiMs: number | null };

/** Layanan eksternal pemeriksa kesehatan AI Agent (PROJECT_RULES 4.3): endpoint health gateway, atau tiruan. */
export interface PemeriksaKesehatanAgent {
  periksa(): Promise<KomponenTersimpan[]>;
}

/** Implementasi mock untuk pengujian dan fallback lokal. */
export class PenyimpananPemantauanMock implements PenyimpananPemantauan {
  private data: DataRingkasanLayanan;
  private panggilanAktif: PanggilanAktif[];
  private antreanTiket: TiketAntrean[];
  private detailKasus: Map<string, DetailKasusPengaduan>;

  constructor(opsi?: {
    ringkasan?: Partial<DataRingkasanLayanan>;
    panggilanAktif?: PanggilanAktif[];
    antreanTiket?: TiketAntrean[];
    detailKasus?: DetailKasusPengaduan[];
  }) {
    this.data = {
      statistik: opsi?.ringkasan?.statistik ?? {
        panggilanHariIni: 0,
        jawabanOtomatisAi: 0,
        tiketEskalasiBaru: 0,
        pengaduanSelesai: 0,
        panggilanBerjalan: 0,
      },
      kategori: opsi?.ringkasan?.kategori ?? [],
      kasusPerluTindakLanjut: opsi?.ringkasan?.kasusPerluTindakLanjut ?? [],
    };
    this.panggilanAktif = opsi?.panggilanAktif ?? [];
    this.antreanTiket = opsi?.antreanTiket ?? [];
    this.detailKasus = new Map((opsi?.detailKasus ?? []).map((d) => [d.noTiket, d]));
  }

  async ambilRingkasan(): Promise<DataRingkasanLayanan> {
    return this.data;
  }

  async ambilStatistik(): Promise<StatistikLayanan> {
    return this.data.statistik;
  }

  async ambilPanggilanAktif(): Promise<PanggilanAktif[]> {
    return this.panggilanAktif;
  }

  async ambilAntreanTiket(): Promise<TiketAntrean[]> {
    return this.antreanTiket;
  }

  async ambilDetailKasus(noTiket: string): Promise<DetailKasusPengaduan | null> {
    return this.detailKasus.get(noTiket) ?? null;
  }
}

/** Kamus pesan PRD-rinci Lampiran A, UC-04. */
export const PESAN_PEMANTAUAN = {
  tidakAdaPanggilan: 'Tidak ada panggilan berjalan saat ini.',
  tiketTidakDitemukan: 'Tiket tidak ditemukan.',
  detailGagalDimuat: 'Data pengaduan gagal dimuat. Muat ulang halaman untuk mencoba lagi.',
  panggilanGagalDimuat: 'Data panggilan gagal dimuat.',
} as const;

export type StatusTiket = 'belum_ditelaah' | 'sedang_ditelaah' | 'menunggu_pemeriksaan' | 'tanggapan_disusun' | 'selesai' | 'diteruskan';
/** Tahap pemrosesan AI yang dilaporkan Voice Gateway (T-F5.2-02). */
export type TahapAi = 'mendengar' | 'memproses' | 'menjawab';

export const LABEL_JENIS_INTERAKSI: Record<string, string> = { informasi_produk: 'Informasi Produk', pengaduan: 'Pengaduan' };
export const LABEL_JENIS_TIKET: Record<KasusPerluTindakLanjut['jenis'], string> = { pengaduan: 'Pengaduan', eskalasi: 'Eskalasi AI' };
export const LABEL_STATUS_TIKET: Record<StatusTiket, string> = {
  belum_ditelaah: 'Belum Ditelaah',
  sedang_ditelaah: 'Sedang Ditelaah',
  menunggu_pemeriksaan: 'Menunggu Pemeriksaan',
  tanggapan_disusun: 'Tanggapan Disusun',
  selesai: 'Selesai',
  diteruskan: 'Diteruskan ke Instansi Lain',
};
const LABEL_TAHAP_AI: Record<TahapAi, string> = { mendengar: 'Mendengar', memproses: 'Memproses', menjawab: 'Menjawab' };
const label = (kamus: Record<string, string>, kunci: string | null | undefined) => (kunci && Object.hasOwn(kamus, kunci) ? kamus[kunci] : undefined);

/** Komponen yang selalu tampil di halaman pantau, meski gateway tidak melaporkannya (T-F5.4-01). */
export const KOMPONEN_AGENT = ['Voice Gateway', 'Hermes', 'STT/TTS', 'cekbpom'] as const;
/** Nama tool cek registrasi di log_tool (InformasiProdukController, REQ-1.3). */
export const TOOL_CEK_REGISTRASI = 'cek_registrasi_bpom';

// REQ-4.1: tabel Kasus Perlu Tindak Lanjut di ringkasan memuat beberapa tiket teratas saja.
export const BATAS_KASUS_RINGKASAN = 3;
export const BATAS_LOG_TOOL = 20;
// Kolom Mingguan panel Beban Panggilan: tujuh hari terakhir, termasuk hari ini.
const HARI_BEBAN_MINGGUAN = 7;
// Batas jam sapaan di Ringkasan (WIB): pagi 04-10, siang 11-14, sore 15-17, malam 18-03.
const JAM_PAGI = 4;
const JAM_SIANG = 11;
const JAM_SORE = 15;
const JAM_MALAM = 18;
// Kartu "pemakaian saluran" membandingkan panggilan aktif dengan kapasitas saluran. NFR-4: target paling sedikit 50 panggilan
// simultan; kapasitas nyata (batas paket STT/TTS dan Hermes) belum dilaporkan gateway.
export const KAPASITAS_SALURAN_BAWAAN = 50;
// Format nomor tiket mengikuti check constraint tabel tiket.
const POLA_NO_TIKET = /^(ADU|ESK)-[0-9]{8}-[0-9]{4}$/;

const DETIK = 1000;

export type Ringkasan = {
  statistik: StatistikLayanan;
  tiketBelumDitelaah: number;
  /** Panel Kinerja AI; persen null bila belum ada panggilan hari ini. */
  kinerja: { jawabanAi: number; eskalasi: number; persen: number | null };
  kategori: { label: string; jumlah: number; persen: number }[];
  kasus: { noTiket: string; ringkasan: string; jenis: string; status: string; waktu: string; menunggu: string }[];
};

export type KolomBeban = { label: string; total: number; dijawabAi: number; dieskalasi: number };
/** puncak null bila tidak ada panggilan pada periode itu. */
export type Beban = { total: number; puncak: KolomBeban | null; kolom: KolomBeban[] };
export type BebanPanggilan = Record<'harian' | 'mingguan' | 'bulanan', Beban>;

export type Panggilan = { id: string; noTelp: string; jenis: string; topik: string; waktuMulai: string; tahap: string };

export type RingkasanPanggilan = { aktif: number; rataDurasiDetik: number; terlamaDetik: number; pemakaianSaluranPersen: number };

export type DetailKasus = {
  noTiket: string;
  jenis: string;
  status: string;
  labelStatus: string;
  ringkasan: string;
  tglTerbit: string;
  namaProduk: string;
  kronologi: string;
  tglPengaduan: string;
  kelengkapan: string;
  namaPelapor: string;
  noTelp: string;
  tautanTranskrip: string;
};

export type BarisAntrean = {
  noTiket: string;
  ringkasan: string;
  jenis: string;
  labelStatus: string;
  waktuMasuk: string;
  noTelp: string;
  tautanKasus: string;
  tautanTranskrip: string | null;
};

export type StatusKomponen = { nama: string; status: 'Normal' | 'Gangguan'; latensiMs: number | null };

export type LogTool = { id: number; namaTool: string; durasiMs: number; hasil: 'Berhasil' | 'Gagal'; waktu: string };

/** log null berarti log_tool gagal dibaca, dibedakan dari log yang memang kosong. */
export type PantauAgent = { komponen: StatusKomponen[]; rataLatensiToolMs: number | null; log: LogTool[] | null };

const jamTampil = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso)).replace(/\./g, ':');

const waktuTampil = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso))
    .replace(/\./g, ':')
    .concat(' WIB');

/** Tanggal kalender 'YYYY-MM-DD' di zona Asia/Jakarta, sama dengan batas "hari ini" di RPC. */
const tanggalWib = (t: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(t));
const tanggalMundur = (tanggal: string, hari: number) => new Date(Date.parse(tanggal) - hari * 24 * 60 * 60 * DETIK).toISOString().slice(0, 10);
const labelTanggal = (opsi: Intl.DateTimeFormatOptions) => (tanggal: string) => new Intl.DateTimeFormat('id-ID', { ...opsi, timeZone: 'UTC' }).format(new Date(tanggal));

// NFR-13: hanya nilai yang sudah tersamar yang boleh tampil.
const tersamar = (s: string | null | undefined) => (s && s.includes('*') ? s : '—');

// Halaman tujuan milik UC-05 (Sprint 3); sampai saat itu tautan berakhir di placeholder.
const tautanTranskrip = (percakapanId: string) => `/riwayat-percakapan/detail?id=${encodeURIComponent(percakapanId)}`;

/** Lama menunggu sejak tiket terbit, dibulatkan ke satuan terbesar. */
export function lamaMenunggu(iso: string, sekarang: Date): string {
  const menit = Math.max(0, Math.floor((sekarang.getTime() - new Date(iso).getTime()) / (60 * DETIK)));
  if (menit < 60) return `${menit} menit`;
  if (menit < 24 * 60) return `${Math.floor(menit / 60)} jam`;
  return `${Math.floor(menit / (24 * 60))} hari`;
}

/** Sapaan Ringkasan menurut jam Asia/Jakarta. */
export function sapaan(sekarang: Date): 'pagi' | 'siang' | 'sore' | 'malam' {
  const jam = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hourCycle: 'h23' }).format(sekarang));
  if (jam < JAM_PAGI || jam >= JAM_MALAM) return 'malam';
  return jam >= JAM_SORE ? 'sore' : jam >= JAM_SIANG ? 'siang' : 'pagi';
}

/**
 * Panel Beban Panggilan: Harian per jam hari ini, Mingguan per hari tujuh hari terakhir, Bulanan per hari bulan ini.
 * Baris di luar kolom periode diabaikan. Sisa total di luar dijawabAi dan dieskalasi (berjalan, tiket terbit, dan status
 * lain) tampil abu-abu.
 */
export function susunBeban(baris: BebanPerJam[], sekarang: Date): BebanPanggilan {
  const hariIni = tanggalWib(sekarang);
  // Kunci kolom adalah awalan jam: 'YYYY-MM-DDTHH' (13 karakter) per jam, 'YYYY-MM-DD' (10) per hari.
  const kelompok = (kunci: string[], panjang: number, label: (k: string) => string): Beban => {
    const kolom = new Map(kunci.map((k) => [k, { label: label(k), total: 0, dijawabAi: 0, dieskalasi: 0 }]));
    for (const b of baris) {
      const k = kolom.get(b.jam.slice(0, panjang));
      if (!k) continue;
      k.total += b.total;
      k.dijawabAi += b.dijawabAi;
      k.dieskalasi += b.dieskalasi;
    }
    const daftar = [...kolom.values()];
    const total = daftar.reduce((n, k) => n + k.total, 0);
    return { total, puncak: total ? daftar.reduce((a, b) => (b.total > a.total ? b : a)) : null, kolom: daftar };
  };
  const urutan = (n: number, kunci: (i: number) => string) => Array.from({ length: n }, (_, i) => kunci(i));
  return {
    harian: kelompok(urutan(24, (i) => `${hariIni}T${String(i).padStart(2, '0')}`), 13, (k) => `${k.slice(11)}:00`),
    mingguan: kelompok(urutan(HARI_BEBAN_MINGGUAN, (i) => tanggalMundur(hariIni, HARI_BEBAN_MINGGUAN - 1 - i)), 10, labelTanggal({ weekday: 'short' })),
    bulanan: kelompok(urutan(Number(hariIni.slice(8)), (i) => `${hariIni.slice(0, 8)}${String(i + 1).padStart(2, '0')}`), 10, labelTanggal({ day: 'numeric', month: 'short' })),
  };
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

/**
 * Control class PemantauanLayananController sesuai Class Diagram SRS (Lampiran B.2).
 */
export class PemantauanLayananController {
  penyimpanan: PenyimpananPemantauan;
  kesehatan?: PemeriksaKesehatanAgent;

  constructor(penyimpanan: PenyimpananPemantauan, kesehatan?: PemeriksaKesehatanAgent) {
    this.penyimpanan = penyimpanan;
    this.kesehatan = kesehatan;
  }

  /** REQ-4.1: Menampilkan ringkasan layanan, kartu statistik, persentase kategori, dan kasus tindak lanjut. */
  async ambilRingkasan(): Promise<DataRingkasanLayanan> {
    return await this.penyimpanan.ambilRingkasan();
  }

  /** Mengambil 5 metrik utama statistik layanan hari ini (zona Asia/Jakarta). */
  async ambilStatistik(): Promise<StatistikLayanan> {
    if (this.penyimpanan.ambilStatistik) {
      return await this.penyimpanan.ambilStatistik();
    }
    const res = await this.penyimpanan.ambilRingkasan();
    return res.statistik;
  }

  /** REQ-4.2: Menampilkan daftar panggilan aktif beserta durasinya. */
  async ambilPanggilanAktif(): Promise<PanggilanAktif[]> {
    if (this.penyimpanan.ambilPanggilanAktif) {
      return await this.penyimpanan.ambilPanggilanAktif();
    }
    return [];
  }

  /** REQ-4.3: Menampilkan antrean tiket eskalasi dan pengaduan untuk ditindaklanjuti. */
  async ambilAntreanTiket(): Promise<TiketAntrean[]> {
    if (this.penyimpanan.ambilAntreanTiket) {
      return await this.penyimpanan.ambilAntreanTiket();
    }
    return [];
  }

  /** REQ-4.4: Membuka detail kasus pengaduan atau eskalasi per tiket. */
  async bukaKasus(noTiket: string): Promise<DetailKasusPengaduan | null> {
    if (this.penyimpanan.ambilDetailKasus) {
      return await this.penyimpanan.ambilDetailKasus(noTiket);
    }
    return null;
  }

  /** REQ-4.1, T-F5.1-02: ringkasan siap tampil, dengan beberapa kasus teratas dan persentase bulat. */
  async ringkasanLayanan(sekarang = new Date()): Promise<Ringkasan> {
    const { statistik, kategori, kasusPerluTindakLanjut } = await this.ambilRingkasan();
    const hariIni = tanggalWib(sekarang);
    return {
      statistik,
      // Sub-label kartu Tiket Eskalasi Baru: bagian dari nilai kartu (eskalasi terbit hari ini) yang belum ditelaah.
      tiketBelumDitelaah: kasusPerluTindakLanjut.filter((k) => k.jenis === 'eskalasi' && k.status === 'belum_ditelaah' && tanggalWib(k.tglTerbit) === hariIni).length,
      // Tingkat Penyelesaian = KPI Deflection PRD bagian 3: persentase panggilan hari ini yang selesai tanpa petugas.
      kinerja: {
        jawabanAi: statistik.jawabanOtomatisAi,
        eskalasi: statistik.tiketEskalasiBaru,
        persen: statistik.panggilanHariIni ? Math.round((statistik.jawabanOtomatisAi * 100) / statistik.panggilanHariIni) : null,
      },
      kategori: kategori.map((k) => ({ label: k.kategori, jumlah: k.jumlah, persen: Math.round(k.persentase) })),
      kasus: kasusPerluTindakLanjut.slice(0, BATAS_KASUS_RINGKASAN).map((k) => ({
        noTiket: k.noTiket,
        ringkasan: k.ringkasan,
        jenis: LABEL_JENIS_TIKET[k.jenis],
        status: label(LABEL_STATUS_TIKET, k.status) ?? k.status,
        waktu: jamTampil(k.tglTerbit),
        menunggu: lamaMenunggu(k.tglTerbit, sekarang),
      })),
    };
  }

  /**
   * REQ-4.1: panel Beban Panggilan; null bila penyimpanan tidak menyediakan beban per jam. Kolom Dieskalasi dihitung dari
   * status percakapan menurut waktu mulai, bukan dari tiket, jadi bisa berbeda dari kartu Tiket Eskalasi Baru di sekitar
   * tengah malam.
   */
  async bebanPanggilan(sekarang = new Date()): Promise<BebanPanggilan | null> {
    if (!this.penyimpanan.ambilBebanPerJam) return null;
    return susunBeban(await this.penyimpanan.ambilBebanPerJam(), sekarang);
  }

  /** REQ-4.2, T-F5.2-01: panggilan aktif dengan nomor tersamar; nomor yang tidak tersamar tidak pernah diteruskan ke halaman. */
  async panggilanBerjalan(): Promise<Panggilan[]> {
    const baris = await this.ambilPanggilanAktif();
    return baris.map((p) => ({
      id: p.id,
      noTelp: tersamar(p.noTelp),
      jenis: label(LABEL_JENIS_INTERAKSI, p.jenisLayanan) ?? 'Memilih layanan',
      topik: p.topik ?? '—',
      waktuMulai: p.waktuMulai,
      tahap: label(LABEL_TAHAP_AI, p.tahapAi) ?? '—',
    }));
  }

  /** REQ-4.4, T-F5.3-03: detail kasus siap tampil; nomor tiket divalidasi sebelum diteruskan ke penyimpanan. */
  async detailKasus(noTiket: unknown): Promise<DetailKasus | { gagal: string }> {
    const no = typeof noTiket === 'string' ? noTiket.trim().toUpperCase() : '';
    if (!POLA_NO_TIKET.test(no)) return { gagal: PESAN_PEMANTAUAN.tiketTidakDitemukan };
    let d: DetailKasusPengaduan | null;
    try {
      d = await this.bukaKasus(no);
    } catch {
      return { gagal: PESAN_PEMANTAUAN.detailGagalDimuat };
    }
    if (!d) return { gagal: PESAN_PEMANTAUAN.tiketTidakDitemukan };
    return {
      noTiket: d.noTiket,
      jenis: LABEL_JENIS_TIKET[d.jenis],
      status: d.status,
      labelStatus: label(LABEL_STATUS_TIKET, d.status) ?? d.status,
      ringkasan: d.ringkasan || '—',
      tglTerbit: waktuTampil(d.tglTerbit),
      namaProduk: d.namaProdukDiadukan || d.namaProduk || '—',
      kronologi: d.kronologi || '—',
      tglPengaduan: d.tglPengaduan ? waktuTampil(d.tglPengaduan) : '—',
      kelengkapan: d.kelengkapan === undefined ? '—' : d.kelengkapan ? 'Lengkap' : 'Tidak lengkap',
      namaPelapor: tersamar(d.namaPelaporTersamar),
      noTelp: tersamar(d.noTelpTersamar),
      tautanTranskrip: tautanTranskrip(d.percakapanId),
    };
  }

  /** REQ-4.3, T-F5.3-02: antrean siap tampil; tiket belum ditelaah di urutan teratas, lalu yang terbaru. */
  async antreanTiket(): Promise<{ tiket: BarisAntrean[] } | { gagal: string }> {
    let baris: TiketAntrean[];
    try {
      baris = await this.ambilAntreanTiket();
    } catch {
      // Kamus belum punya pesan khusus antrean; dipakai pesan gagal muat terdekat (UC-04).
      return { gagal: PESAN_PEMANTAUAN.detailGagalDimuat };
    }
    const belum = (t: TiketAntrean) => (t.status === 'belum_ditelaah' ? 0 : 1);
    return {
      tiket: [...baris]
        .sort((a, b) => belum(a) - belum(b) || Date.parse(b.waktuMasuk) - Date.parse(a.waktuMasuk))
        .map((t) => ({
          noTiket: t.noTiket,
          ringkasan: t.ringkasan || '—',
          jenis: LABEL_JENIS_TIKET[t.jenis],
          labelStatus: label(LABEL_STATUS_TIKET, t.status) ?? t.status,
          waktuMasuk: waktuTampil(t.waktuMasuk),
          noTelp: tersamar(t.noTelpTersamar),
          tautanKasus: `/pengaduan/detail?tiket=${encodeURIComponent(t.noTiket)}`,
          tautanTranskrip: t.percakapanId ? tautanTranskrip(t.percakapanId) : null,
        })),
    };
  }

  /** T-F5.4-01: kesehatan komponen, rata-rata latensi tool, dan log tool terbaru. */
  async pantauAgent(): Promise<PantauAgent> {
    const [hasil, log] = await Promise.all([
      // Gateway tidak terjangkau berarti semua komponen di belakangnya tidak bisa dipastikan sehat.
      (this.kesehatan?.periksa() ?? Promise.resolve([])).catch((): KomponenTersimpan[] => []),
      // Log yang gagal dibaca tidak boleh menutupi status komponen.
      (this.penyimpanan.ambilLogTool?.(BATAS_LOG_TOOL) ?? Promise.resolve([])).catch(() => null),
    ]);
    const daftar = log ?? [];
    const perNama = new Map(hasil.map((k) => [k.nama, k]));
    // cekbpom dipanggil lewat tool cek registrasi, jadi kondisinya diambil dari pemanggilan tool terakhir, selama
    // gateway terjangkau dan belum melaporkannya sendiri.
    const cekTerakhir = daftar.reduce<LogToolTersimpan | null>((t, l) => (l.namaTool === TOOL_CEK_REGISTRASI && (!t || l.waktu > t.waktu) ? l : t), null);
    if (hasil.length && cekTerakhir && !perNama.has('cekbpom')) {
      perNama.set('cekbpom', { nama: 'cekbpom', sehat: cekTerakhir.berhasil, latensiMs: cekTerakhir.durasiMs });
    }
    const komponen = [...KOMPONEN_AGENT, ...hasil.map((k) => k.nama).filter((n) => !(KOMPONEN_AGENT as readonly string[]).includes(n))].map(
      (nama): StatusKomponen => {
        const k = perNama.get(nama);
        return { nama, status: k?.sehat ? 'Normal' : 'Gangguan', latensiMs: k?.latensiMs ?? null };
      },
    );
    const urut = [...daftar].sort((a, b) => b.waktu.localeCompare(a.waktu) || b.id - a.id);
    return {
      komponen,
      rataLatensiToolMs: urut.length ? Math.round(urut.reduce((n, l) => n + l.durasiMs, 0) / urut.length) : null,
      log: log && urut.map((l) => ({ id: l.id, namaTool: l.namaTool, durasiMs: l.durasiMs, hasil: l.berhasil ? 'Berhasil' : 'Gagal', waktu: jamTampil(l.waktu) })),
    };
  }
}
