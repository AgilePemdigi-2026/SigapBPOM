// Control UC-05 Membaca Transkrip Percakapan (REQ-5.1, REQ-5.2, REQ-5.3, REQ-5.4, NFR-13).
// Petugas membaca riwayat percakapan dan transkrip lengkap dengan nomor telepon dan nama pelapor tersamar,
// serta menyimpan catatan pemeriksaan.
// Mengikuti pola BCE dan nama class diagram SRS.

/** Kamus pesan PRD-rinci Lampiran A (UC-05 "Catatan tersimpan", REQ-5.3). */
export const PESAN_CATATAN_TERSIMPAN = 'Catatan pemeriksaan tersimpan.';

/** Kamus pesan PRD-rinci Lampiran A (UC-05 "Catatan kosong", REQ-5.4). */
export const PESAN_CATATAN_WAJIB_DIISI = 'Catatan pemeriksaan wajib diisi.';

export interface BarisRiwayatPercakapan {
  id: string;
  percakapanId: string;
  waktuMulai: string;
  waktuSelesai: string | null;
  jenisInteraksi: 'informasi_produk' | 'pengaduan' | null;
  ringkasan: string | null;
  statusPenyelesaian: string;
  noTiket: string | null;
  noTelp: string | null;
  noTelpTersamar: string | null;
  namaPelaporTersamar?: string | null;
}

export interface RingkasanPeriodePercakapan {
  totalPercakapan: number;
  informasiProduk: number;
  pengaduanProduk: number;
  dieskalasi: number;
}

export interface UcapanTranskrip {
  id: number;
  percakapanId: string;
  urutan: number;
  pembicara: 'sistem' | 'penelepon';
  teks: string;
  detikKe: number;
}

export interface CatatanPemeriksaan {
  id: string;
  percakapanId: string;
  petugasId: string;
  petugasNama?: string | null;
  isi: string;
  waktu: string;
}

export interface DetailTranskripPercakapan {
  percakapan: BarisRiwayatPercakapan;
  ucapan: UcapanTranskrip[];
  catatanPemeriksaan?: CatatanPemeriksaan[];
}

export interface FilterRiwayat {
  awal?: string;
  akhir?: string;
  jenis?: 'informasi_produk' | 'pengaduan';
  /** Paginasi Daftar Percakapan (T-F6.1-02): lewati `offset` baris, ambil paling banyak `batas` baris. */
  offset?: number;
  batas?: number;
}

/** Mengubah nama pelapor "Budi Santoso" -> "B*** S******" (NFR-13, REQ-5.2). */
export function samarkanNama(nama: string | null | undefined): string | null {
  if (!nama || !nama.trim()) return null;
  return nama
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 1 ? `${w[0]}${'*'.repeat(w.length - 1)}` : w))
    .join(' ');
}

/** Menyamarkan nama pelapor di dalam teks ucapan secara peka batas kata. */
export function samarkanNamaDiTeks(teks: string, nama: string | null | undefined): string {
  if (!teks || !nama || !nama.trim()) return teks;
  const namaBersih = nama.trim();
  const namaSamar = samarkanNama(namaBersih);
  if (!namaSamar) return teks;

  // 1. Ganti nama lengkap terlebih dahulu
  const escapeRegex = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  let hasil = teks.replace(new RegExp(`\\b${escapeRegex(namaBersih)}\\b`, 'gi'), namaSamar);

  // 2. Ganti setiap kata penyusun nama jika panjang >= 3
  const kata = namaBersih.split(/\s+/);
  for (const k of kata) {
    if (k.length >= 3) {
      const kataSamar = `${k[0]}${'*'.repeat(k.length - 1)}`;
      hasil = hasil.replace(new RegExp(`\\b${escapeRegex(k)}\\b`, 'gi'), kataSamar);
    }
  }

  return hasil;
}

/** Interface adapter penyimpanan riwayat, transkrip, dan catatan pemeriksaan (PROJECT_RULES 4.3). */
export interface PenyimpananTranskripPetugas {
  ambilRiwayat(filter?: FilterRiwayat): Promise<BarisRiwayatPercakapan[]>;
  ambilRingkasanPeriode(filter?: { awal?: string; akhir?: string }): Promise<RingkasanPeriodePercakapan>;
  ambilTranskrip(percakapanId: string): Promise<UcapanTranskrip[]>;
  ambilDetail(percakapanId: string): Promise<BarisRiwayatPercakapan | null>;
  simpanCatatan(percakapanId: string, catatan: string): Promise<{ id: string; pesan: string }>;
  ambilCatatan(percakapanId: string): Promise<CatatanPemeriksaan[]>;
}

/** Implementasi tiruan (Mock) untuk pengujian lokal dan fallback tanpa koneksi db. */
export class PenyimpananTranskripMock implements PenyimpananTranskripPetugas {
  riwayat: BarisRiwayatPercakapan[];
  transkripMap: Map<string, UcapanTranskrip[]>;
  catatanMap: Map<string, CatatanPemeriksaan[]>;

  constructor(dataAwal?: {
    riwayat?: BarisRiwayatPercakapan[];
    transkrip?: Record<string, UcapanTranskrip[]>;
    catatan?: Record<string, CatatanPemeriksaan[]>;
  }) {
    this.riwayat = dataAwal?.riwayat ? [...dataAwal.riwayat] : [
      {
        id: '88888888-0000-0000-0000-000000000001',
        percakapanId: '88888888-0000-0000-0000-000000000001',
        waktuMulai: '2026-11-04T08:00:00Z',
        waktuSelesai: '2026-11-04T08:03:15Z',
        jenisInteraksi: 'informasi_produk',
        ringkasan: 'Pertanyaan NIE susu formula',
        statusPenyelesaian: 'selesai_ai',
        noTiket: null,
        noTelp: '0812****7890',
        noTelpTersamar: '0812****7890',
        namaPelaporTersamar: 'B***',
      },
      {
        id: '88888888-0000-0000-0000-000000000002',
        percakapanId: '88888888-0000-0000-0000-000000000002',
        waktuMulai: '2026-11-04T09:15:00Z',
        waktuSelesai: '2026-11-04T09:21:00Z',
        jenisInteraksi: 'pengaduan',
        ringkasan: 'Pengaduan kosmetik ilegal',
        statusPenyelesaian: 'tiket_terbit',
        noTiket: 'ADU-20261104-0001',
        noTelp: '0812****7890',
        noTelpTersamar: '0812****7890',
        namaPelaporTersamar: 'B***',
      },
      {
        id: '88888888-0000-0000-0000-000000000003',
        percakapanId: '88888888-0000-0000-0000-000000000003',
        waktuMulai: '2026-11-04T10:00:00Z',
        waktuSelesai: '2026-11-04T10:05:30Z',
        jenisInteraksi: 'informasi_produk',
        ringkasan: 'Pertanyaan efek samping sirup',
        statusPenyelesaian: 'dieskalasi',
        noTiket: 'ESK-20261104-0001',
        noTelp: '0812****7890',
        noTelpTersamar: '0812****7890',
        namaPelaporTersamar: 'B***',
      },
    ];

    this.transkripMap = new Map();
    if (dataAwal?.transkrip) {
      for (const [id, ucapan] of Object.entries(dataAwal.transkrip)) {
        this.transkripMap.set(id, ucapan);
      }
    } else {
      this.transkripMap.set('88888888-0000-0000-0000-000000000002', [
        {
          id: 1,
          percakapanId: '88888888-0000-0000-0000-000000000002',
          urutan: 1,
          pembicara: 'sistem',
          teks: 'Silakan sebutkan nama produk, kronologi kejadian, nama, dan nomor telepon Anda.',
          detikKe: 0,
        },
        {
          id: 2,
          percakapanId: '88888888-0000-0000-0000-000000000002',
          urutan: 2,
          pembicara: 'penelepon',
          teks: 'Nama saya B*** S******, nomor saya 0812****7890 mengadukan krim wajah alami.',
          detikKe: 5,
        },
        {
          id: 3,
          percakapanId: '88888888-0000-0000-0000-000000000002',
          urutan: 3,
          pembicara: 'sistem',
          teks: 'Terima kasih Bapak B*** S******, laporan Anda telah kami catat.',
          detikKe: 15,
        },
      ]);
    }

    this.catatanMap = new Map();
    if (dataAwal?.catatan) {
      for (const [id, catatan] of Object.entries(dataAwal.catatan)) {
        this.catatanMap.set(id, catatan);
      }
    }
  }

  async ambilRiwayat(filter?: FilterRiwayat): Promise<BarisRiwayatPercakapan[]> {
    let hasil = [...this.riwayat];
    if (filter?.jenis) {
      hasil = hasil.filter((r) => r.jenisInteraksi === filter.jenis);
    }
    if (filter?.awal) {
      const tAwal = new Date(filter.awal).getTime();
      hasil = hasil.filter((r) => new Date(r.waktuMulai).getTime() >= tAwal);
    }
    if (filter?.akhir) {
      const tAkhir = new Date(filter.akhir).getTime();
      hasil = hasil.filter((r) => new Date(r.waktuMulai).getTime() <= tAkhir);
    }
    // Urutan sama dengan view riwayat_percakapan: terbaru lebih dulu.
    hasil.sort((a, b) => b.waktuMulai.localeCompare(a.waktuMulai));
    const offset = filter?.offset ?? 0;
    return filter?.batas === undefined ? hasil.slice(offset) : hasil.slice(offset, offset + filter.batas);
  }

  async ambilRingkasanPeriode(filter?: { awal?: string; akhir?: string }): Promise<RingkasanPeriodePercakapan> {
    const data = await this.ambilRiwayat(filter);
    return {
      totalPercakapan: data.length,
      informasiProduk: data.filter((d) => d.jenisInteraksi === 'informasi_produk').length,
      pengaduanProduk: data.filter((d) => d.jenisInteraksi === 'pengaduan').length,
      dieskalasi: data.filter((d) => d.statusPenyelesaian === 'dieskalasi').length,
    };
  }

  async ambilTranskrip(percakapanId: string): Promise<UcapanTranskrip[]> {
    return this.transkripMap.get(percakapanId) ?? [];
  }

  async ambilDetail(percakapanId: string): Promise<BarisRiwayatPercakapan | null> {
    return this.riwayat.find((r) => r.id === percakapanId || r.percakapanId === percakapanId) ?? null;
  }

  async simpanCatatan(percakapanId: string, catatan: string): Promise<{ id: string; pesan: string }> {
    const daftar = this.catatanMap.get(percakapanId) ?? [];
    const id = `catatan-${Date.now()}-${daftar.length + 1}`;
    daftar.unshift({
      id,
      percakapanId,
      petugasId: '00000000-0000-0000-0000-000000000099',
      petugasNama: 'Petugas Uji',
      isi: catatan,
      waktu: new Date().toISOString(),
    });
    this.catatanMap.set(percakapanId, daftar);
    return { id, pesan: PESAN_CATATAN_TERSIMPAN };
  }

  async ambilCatatan(percakapanId: string): Promise<CatatanPemeriksaan[]> {
    return this.catatanMap.get(percakapanId) ?? [];
  }
}

/** Adapter Supabase untuk membaca dan menyimpan riwayat, transkrip, dan catatan pemeriksaan petugas. */
export class PenyimpananTranskripSupabase implements PenyimpananTranskripPetugas {
  klien: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          order: (col: string, opts?: { ascending?: boolean }) => Promise<{ data: unknown; error: unknown }>;
        };
        order: (col: string, opts?: { ascending?: boolean }) => Promise<{ data: unknown; error: unknown }>;
      };
    };
    rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };

  constructor(klienSupabase: unknown) {
    this.klien = klienSupabase as typeof this.klien;
  }

  async ambilRiwayat(filter?: FilterRiwayat): Promise<BarisRiwayatPercakapan[]> {
    let q = this.klien.from('riwayat_percakapan').select('*');
    if (filter?.jenis) {
      const res = await q.eq('jenis_interaksi', filter.jenis).order('waktu_mulai', { ascending: false });
      if (res.error) throw res.error;
      return (res.data as BarisRiwayatPercakapan[]) ?? [];
    }
    const res = await q.order('waktu_mulai', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as BarisRiwayatPercakapan[]) ?? [];
  }

  async ambilRingkasanPeriode(filter?: { awal?: string; akhir?: string }): Promise<RingkasanPeriodePercakapan> {
    const res = await this.klien.rpc('ambil_ringkasan_periode_percakapan', {
      p_awal: filter?.awal ?? null,
      p_akhir: filter?.akhir ?? null,
    });
    if (res.error) throw res.error;
    const d = res.data as Record<string, number>;
    return {
      totalPercakapan: Number(d?.total_percakapan ?? 0),
      informasiProduk: Number(d?.informasi_produk ?? 0),
      pengaduanProduk: Number(d?.pengaduan_produk ?? 0),
      dieskalasi: Number(d?.dieskalasi ?? 0),
    };
  }

  async ambilTranskrip(percakapanId: string): Promise<UcapanTranskrip[]> {
    const res = await this.klien
      .from('ucapan_petugas')
      .select('*')
      .eq('percakapan_id', percakapanId)
      .order('urutan', { ascending: true });
    if (res.error) throw res.error;
    return (res.data as UcapanTranskrip[]) ?? [];
  }

  async ambilDetail(percakapanId: string): Promise<BarisRiwayatPercakapan | null> {
    const res = await this.klien
      .from('riwayat_percakapan')
      .select('*')
      .eq('id', percakapanId)
      .order('waktu_mulai', { ascending: false });
    if (res.error) throw res.error;
    const daftar = (res.data as BarisRiwayatPercakapan[]) ?? [];
    return daftar.length > 0 ? daftar[0] : null;
  }

  async simpanCatatan(percakapanId: string, catatan: string): Promise<{ id: string; pesan: string }> {
    const res = await this.klien.rpc('simpan_catatan_pemeriksaan', {
      p_percakapan_id: percakapanId,
      p_catatan: catatan,
    });
    if (res.error) throw res.error;
    return {
      id: String(res.data),
      pesan: PESAN_CATATAN_TERSIMPAN,
    };
  }

  async ambilCatatan(percakapanId: string): Promise<CatatanPemeriksaan[]> {
    const res = await this.klien.rpc('ambil_catatan_pemeriksaan', {
      p_percakapan_id: percakapanId,
    });
    if (res.error) throw res.error;
    return (res.data as CatatanPemeriksaan[]) ?? [];
  }
}

/** Controller UC-05 Membaca Transkrip Percakapan dan Menyimpan Catatan Pemeriksaan. */
export class TranskripController {
  penyimpanan: PenyimpananTranskripPetugas;

  constructor(penyimpanan: PenyimpananTranskripPetugas) {
    this.penyimpanan = penyimpanan;
  }

  async ambilRiwayat(filter?: FilterRiwayat): Promise<BarisRiwayatPercakapan[]> {
    return this.penyimpanan.ambilRiwayat(filter);
  }

  async ambilRingkasanPeriode(filter?: { awal?: string; akhir?: string }): Promise<RingkasanPeriodePercakapan> {
    return this.penyimpanan.ambilRingkasanPeriode(filter);
  }

  async ambilTranskrip(percakapanId: string): Promise<UcapanTranskrip[]> {
    if (!percakapanId || typeof percakapanId !== 'string') {
      throw new Error('ID percakapan tidak valid.');
    }
    return this.penyimpanan.ambilTranskrip(percakapanId);
  }

  async ambilDetailTranskrip(percakapanId: string): Promise<DetailTranskripPercakapan | null> {
    if (!percakapanId || typeof percakapanId !== 'string') {
      throw new Error('ID percakapan tidak valid.');
    }
    const percakapan = await this.penyimpanan.ambilDetail(percakapanId);
    if (!percakapan) return null;
    const ucapan = await this.penyimpanan.ambilTranskrip(percakapanId);
    const catatanPemeriksaan = await this.penyimpanan.ambilCatatan(percakapanId);
    return {
      percakapan,
      ucapan,
      catatanPemeriksaan,
    };
  }

  async simpanCatatanPemeriksaan(percakapanId: string, catatan: string): Promise<{ id: string; pesan: string }> {
    if (!percakapanId || typeof percakapanId !== 'string') {
      throw new Error('ID percakapan tidak valid.');
    }
    const bersih = typeof catatan === 'string' ? catatan.trim() : '';
    if (!bersih) {
      throw new Error(PESAN_CATATAN_WAJIB_DIISI);
    }
    if (bersih.length > 2000) {
      throw new Error('Catatan pemeriksaan melebihi batas maksimal 2000 karakter.');
    }
    return this.penyimpanan.simpanCatatan(percakapanId, bersih);
  }

  async ambilCatatanPemeriksaan(percakapanId: string): Promise<CatatanPemeriksaan[]> {
    if (!percakapanId || typeof percakapanId !== 'string') {
      throw new Error('ID percakapan tidak valid.');
    }
    return this.penyimpanan.ambilCatatan(percakapanId);
  }
}
