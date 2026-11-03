// Control UC-04 Memantau Layanan: ringkasan layanan (REQ-4.1), antrean tiket (REQ-4.3), dan detail kasus (REQ-4.4).

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

export interface PanggilanAktif {
  id: string;
  noTelp: string;
  jenisLayanan: string;
  topik: string;
  waktuMulai: string;
  durasiDetik: number;
  tahapAi: string;
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

/** Penyimpanan pemantauan layanan (PROJECT_RULES 4.3): Supabase via RPC/view atau implementasi tiruan (mock). */
export interface PenyimpananPemantauan {
  ambilRingkasan(): Promise<DataRingkasanLayanan>;
  ambilStatistik?(): Promise<StatistikLayanan>;
  ambilPanggilanAktif?(): Promise<PanggilanAktif[]>;
  ambilAntreanTiket?(): Promise<TiketAntrean[]>;
  ambilDetailKasus?(noTiket: string): Promise<DetailKasusPengaduan | null>;
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

/**
 * Control class PemantauanLayananController sesuai Class Diagram SRS (Lampiran B.2).
 */
export class PemantauanLayananController {
  penyimpanan: PenyimpananPemantauan;

  constructor(penyimpanan: PenyimpananPemantauan) {
    this.penyimpanan = penyimpanan;
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
}
