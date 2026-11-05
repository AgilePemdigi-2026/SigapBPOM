// Control UC-06 Menangani Pengaduan (REQ-6.1, REQ-6.2, REQ-6.3, BR-3).
// Menangani telaah berkas pengaduan dan penetapan jadwal pemeriksaan sarana.
// Mengikuti pola BCE dan nama class diagram SRS (PenangananController).

/** Kamus pesan PRD-rinci Lampiran A (UC-06). */
export const PESAN_TELAAH_TERSIMPAN = 'Hasil telaah tersimpan.';
export const PESAN_BUKAN_KEWENANGAN = 'Pengaduan diteruskan ke instansi lain.';
export const PESAN_JADWAL_TERSIMPAN = 'Jadwal pemeriksaan tersimpan.';
export const PESAN_TANGGAPAN_TERSIMPAN = 'Tanggapan tersimpan.';
export const PESAN_TUTUP_TIKET = 'Tiket ditutup.';
export const PESAN_TUTUP_TANPA_TANGGAPAN = 'Tiket tidak dapat ditutup. Susun tanggapan terlebih dahulu.';

export type TindakLanjut = 'Telaah Dokumen' | 'Perlu Pemeriksaan Lapangan' | 'Bukan Kewenangan BPOM';

export const OPSI_TINDAK_LANJUT: readonly TindakLanjut[] = [
  'Telaah Dokumen',
  'Perlu Pemeriksaan Lapangan',
  'Bukan Kewenangan BPOM',
] as const;

export interface HasilTelaah {
  id: string;
  tiketId: string;
  noTiket?: string;
  tindakLanjut: TindakLanjut;
  catatan?: string | null;
  petugasId: string;
  petugasNama?: string | null;
  waktu: string;
}

export interface JadwalPemeriksaan {
  id: string;
  tiketId: string;
  noTiket?: string;
  tanggal: string;
  unitPelaksana: string;
  status: string;
  petugasId: string;
  petugasNama?: string | null;
  waktu: string;
}

export interface ResponTelaah {
  id: string;
  noTiket: string;
  status: string;
  tindakLanjut: string;
  pesan: string;
}

export interface ResponJadwal {
  id: string;
  noTiket: string;
  status: string;
  tanggal: string;
  unitPelaksana: string;
  pesan: string;
}

/** Interface adapter penyimpanan penanganan pengaduan (PROJECT_RULES 4.3). */
export interface PenyimpananPenanganan {
  simpanTelaah(noTiket: string, tindakLanjut: TindakLanjut, catatan?: string | null): Promise<ResponTelaah>;
  simpanJadwal(noTiket: string, tanggal: string, unitPelaksana: string): Promise<ResponJadwal>;
  ambilRiwayatTelaah(noTiket: string): Promise<HasilTelaah[]>;
  ambilJadwal(noTiket: string): Promise<JadwalPemeriksaan[]>;
}

/** Implementasi tiruan (Mock) untuk pengujian dan fallback lokal tanpa basis data. */
export class PenyimpananPenangananMock implements PenyimpananPenanganan {
  tiketMap: Map<string, { status: string; jenis: string }>;
  telaahMap: Map<string, HasilTelaah[]>;
  jadwalMap: Map<string, JadwalPemeriksaan[]>;

  constructor(dataAwalTiket?: Record<string, { status: string; jenis: string }>) {
    this.tiketMap = new Map();
    this.telaahMap = new Map();
    this.jadwalMap = new Map();

    const bawaan: Record<string, { status: string; jenis: string }> = dataAwalTiket ?? {
      'ADU-20261104-0010': { status: 'belum_ditelaah', jenis: 'pengaduan' },
      'ADU-20261104-0020': { status: 'belum_ditelaah', jenis: 'pengaduan' },
      'ADU-20261104-0030': { status: 'belum_ditelaah', jenis: 'pengaduan' },
      'ADU-20261104-0040': { status: 'selesai', jenis: 'pengaduan' },
      'ADU-20261104-0050': { status: 'diteruskan', jenis: 'pengaduan' },
    };

    for (const [k, v] of Object.entries(bawaan)) {
      this.tiketMap.set(k, v);
    }
  }

  async simpanTelaah(noTiket: string, tindakLanjut: TindakLanjut, catatan?: string | null): Promise<ResponTelaah> {
    const t = this.tiketMap.get(noTiket);
    if (!t) {
      throw new Error(`Tiket ${noTiket} tidak ditemukan.`);
    }

    if (t.status === 'diteruskan') {
      throw new Error(`Tiket ${noTiket} sudah diteruskan ke instansi lain dan tidak dapat ditelaah lagi.`);
    }
    if (t.status === 'selesai') {
      throw new Error(`Tiket ${noTiket} sudah selesai dan tidak dapat ditelaah lagi.`);
    }
    if (t.status === 'tanggapan_disusun') {
      throw new Error(`Tiket ${noTiket} sudah dalam tahap tanggapan disusun dan tidak dapat ditelaah lagi.`);
    }

    let statusBaru = 'sedang_ditelaah';
    let pesan = PESAN_TELAAH_TERSIMPAN;

    if (tindakLanjut === 'Bukan Kewenangan BPOM') {
      statusBaru = 'diteruskan';
      pesan = PESAN_BUKAN_KEWENANGAN;
    }

    t.status = statusBaru;
    this.tiketMap.set(noTiket, t);

    const riwayat = this.telaahMap.get(noTiket) ?? [];
    const id = `telaah-${Date.now()}-${riwayat.length + 1}`;
    riwayat.unshift({
      id,
      tiketId: noTiket,
      noTiket,
      tindakLanjut,
      catatan: catatan ?? null,
      petugasId: '00000000-0000-0000-0000-000000000099',
      petugasNama: 'Petugas Uji',
      waktu: new Date().toISOString(),
    });
    this.telaahMap.set(noTiket, riwayat);

    return {
      id,
      noTiket,
      status: statusBaru,
      tindakLanjut,
      pesan,
    };
  }

  async simpanJadwal(noTiket: string, tanggal: string, unitPelaksana: string): Promise<ResponJadwal> {
    const t = this.tiketMap.get(noTiket);
    if (!t) {
      throw new Error(`Tiket ${noTiket} tidak ditemukan.`);
    }
    if (t.status === 'diteruskan' || t.status === 'selesai') {
      throw new Error(`Tiket ${noTiket} sudah ${t.status} dan tidak dapat dijadwalkan.`);
    }

    t.status = 'menunggu_pemeriksaan';
    this.tiketMap.set(noTiket, t);

    const riwayat = this.jadwalMap.get(noTiket) ?? [];
    const id = `jadwal-${Date.now()}-${riwayat.length + 1}`;
    riwayat.unshift({
      id,
      tiketId: noTiket,
      noTiket,
      tanggal,
      unitPelaksana,
      status: 'menunggu_pemeriksaan',
      petugasId: '00000000-0000-0000-0000-000000000099',
      petugasNama: 'Petugas Uji',
      waktu: new Date().toISOString(),
    });
    this.jadwalMap.set(noTiket, riwayat);

    return {
      id,
      noTiket,
      status: 'menunggu_pemeriksaan',
      tanggal,
      unitPelaksana,
      pesan: PESAN_JADWAL_TERSIMPAN,
    };
  }

  async ambilRiwayatTelaah(noTiket: string): Promise<HasilTelaah[]> {
    return this.telaahMap.get(noTiket) ?? [];
  }

  async ambilJadwal(noTiket: string): Promise<JadwalPemeriksaan[]> {
    return this.jadwalMap.get(noTiket) ?? [];
  }
}

/** Adapter Supabase untuk memanggil RPC simpan_telaah dan simpan_jadwal_pemeriksaan. */
export class PenyimpananPenangananSupabase implements PenyimpananPenanganan {
  klien: {
    rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };

  constructor(klienSupabase: unknown) {
    this.klien = klienSupabase as typeof this.klien;
  }

  async simpanTelaah(noTiket: string, tindakLanjut: TindakLanjut, catatan?: string | null): Promise<ResponTelaah> {
    const res = await this.klien.rpc('simpan_telaah', {
      p_no_tiket: noTiket,
      p_tindak_lanjut: tindakLanjut,
      p_catatan: catatan ?? null,
    });
    if (res.error) throw res.error;
    const d = res.data as Record<string, unknown>;
    return {
      id: String(d.id),
      noTiket: String(d.no_tiket ?? noTiket),
      status: String(d.status),
      tindakLanjut: String(d.tindak_lanjut ?? tindakLanjut),
      pesan: String(d.pesan),
    };
  }

  async simpanJadwal(noTiket: string, tanggal: string, unitPelaksana: string): Promise<ResponJadwal> {
    const res = await this.klien.rpc('simpan_jadwal_pemeriksaan', {
      p_no_tiket: noTiket,
      p_tanggal: tanggal,
      p_unit: unitPelaksana,
    });
    if (res.error) throw res.error;
    const d = res.data as Record<string, unknown>;
    return {
      id: String(d.id),
      noTiket: String(d.no_tiket ?? noTiket),
      status: String(d.status),
      tanggal: String(d.tanggal ?? tanggal),
      unitPelaksana: String(d.unit_pelaksana ?? unitPelaksana),
      pesan: String(d.pesan),
    };
  }

  async ambilRiwayatTelaah(noTiket: string): Promise<HasilTelaah[]> {
    const res = await this.klien.rpc('ambil_riwayat_telaah', {
      p_no_tiket: noTiket,
    });
    if (res.error) throw res.error;
    return (res.data as HasilTelaah[]) ?? [];
  }

  async ambilJadwal(noTiket: string): Promise<JadwalPemeriksaan[]> {
    const res = await this.klien.rpc('ambil_jadwal_pemeriksaan', {
      p_no_tiket: noTiket,
    });
    if (res.error) throw res.error;
    return (res.data as JadwalPemeriksaan[]) ?? [];
  }
}

/** Controller UC-06 Menangani Pengaduan. */
export class PenangananController {
  penyimpanan: PenyimpananPenanganan;

  constructor(penyimpanan: PenyimpananPenanganan) {
    this.penyimpanan = penyimpanan;
  }

  async simpanTelaah(noTiket: string, tindakLanjut: TindakLanjut, catatan?: string | null): Promise<ResponTelaah> {
    if (!noTiket || typeof noTiket !== 'string' || !noTiket.trim()) {
      throw new Error('Nomor tiket tidak valid.');
    }
    if (!OPSI_TINDAK_LANJUT.includes(tindakLanjut)) {
      throw new Error(`Pilihan tindak lanjut tidak valid: ${tindakLanjut}`);
    }
    return this.penyimpanan.simpanTelaah(noTiket.trim(), tindakLanjut, catatan ? catatan.trim() : null);
  }

  async simpanJadwalPemeriksaan(noTiket: string, tanggal: string, unitPelaksana: string): Promise<ResponJadwal> {
    if (!noTiket || typeof noTiket !== 'string' || !noTiket.trim()) {
      throw new Error('Nomor tiket tidak valid.');
    }
    if (!tanggal || typeof tanggal !== 'string' || !tanggal.trim()) {
      throw new Error('Tanggal pemeriksaan wajib diisi.');
    }
    if (!unitPelaksana || typeof unitPelaksana !== 'string' || !unitPelaksana.trim()) {
      throw new Error('Unit pelaksana wajib diisi.');
    }
    return this.penyimpanan.simpanJadwal(noTiket.trim(), tanggal.trim(), unitPelaksana.trim());
  }

  async ambilRiwayatTelaah(noTiket: string): Promise<HasilTelaah[]> {
    if (!noTiket || typeof noTiket !== 'string' || !noTiket.trim()) {
      throw new Error('Nomor tiket tidak valid.');
    }
    return this.penyimpanan.ambilRiwayatTelaah(noTiket.trim());
  }

  async ambilJadwal(noTiket: string): Promise<JadwalPemeriksaan[]> {
    if (!noTiket || typeof noTiket !== 'string' || !noTiket.trim()) {
      throw new Error('Nomor tiket tidak valid.');
    }
    return this.penyimpanan.ambilJadwal(noTiket.trim());
  }
}
