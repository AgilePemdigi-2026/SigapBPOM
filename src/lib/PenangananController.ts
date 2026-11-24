// Control UC-06 Menangani Pengaduan (REQ-6.1 sampai REQ-6.6, BR-2, BR-3).
// Menangani telaah berkas pengaduan, jadwal pemeriksaan sarana, penyusunan tanggapan resmi, dan penutupan tiket.
// Mengikuti pola BCE dan nama class diagram SRS (PenangananController).
import type { KontakPelapor } from './kontakPelapor.ts';

/** Kamus pesan PRD-rinci Lampiran A (UC-06). */
export const PESAN_TELAAH_TERSIMPAN = 'Hasil telaah tersimpan.';
export const PESAN_BUKAN_KEWENANGAN = 'Pengaduan diteruskan ke instansi lain.';
export const PESAN_JADWAL_TERSIMPAN = 'Jadwal pemeriksaan tersimpan.';
export const PESAN_TANGGAPAN_TERSIMPAN = 'Tanggapan tersimpan.';
export const PESAN_TUTUP_TIKET = 'Tiket ditutup.';
export const PESAN_TUTUP_TANPA_TANGGAPAN = 'Tiket tidak dapat ditutup. Susun tanggapan terlebih dahulu.';
/** ADR 0006: belum ada di kamus Lampiran A, diusulkan bersama change request tindak lanjut WhatsApp. */
export const PESAN_SUDAH_DIHUBUNGI = 'Pelapor ditandai sudah dihubungi.';

export type TindakLanjut = 'Telaah Dokumen' | 'Perlu Pemeriksaan Lapangan' | 'Bukan Kewenangan BPOM';

export const OPSI_TINDAK_LANJUT: readonly TindakLanjut[] = [
  'Telaah Dokumen',
  'Perlu Pemeriksaan Lapangan',
  'Bukan Kewenangan BPOM',
] as const;

/** Enum basis data `tindak_lanjut` ke label pilihan "Tindak Lanjut" (REQ-6.1). */
const LABEL_TINDAK_LANJUT: Record<string, TindakLanjut> = {
  telaah_dokumen: 'Telaah Dokumen',
  pemeriksaan_lapangan: 'Perlu Pemeriksaan Lapangan',
  bukan_kewenangan: 'Bukan Kewenangan BPOM',
};

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

export interface TanggapanResmi {
  id: string;
  tiketId: string;
  noTiket?: string;
  isi: string;
  petugasId: string;
  petugasNama?: string | null;
  status: string;
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

export interface ResponTanggapan {
  id?: string;
  noTiket: string;
  status: string;
  pesan: string;
}

export interface ResponTutupTiket {
  noTiket: string;
  status: string;
  pesan: string;
}

export interface ResponTandaiDihubungi {
  noTiket: string;
  status: string;
  pesan: string;
}

/** Interface adapter penyimpanan penanganan pengaduan (PROJECT_RULES 4.3). */
export interface PenyimpananPenanganan {
  simpanTelaah(noTiket: string, tindakLanjut: TindakLanjut, catatan?: string | null): Promise<ResponTelaah>;
  simpanJadwal(noTiket: string, tanggal: string, unitPelaksana: string): Promise<ResponJadwal>;
  simpanTanggapan(noTiket: string, isi: string): Promise<ResponTanggapan>;
  tutupTiket(noTiket: string): Promise<ResponTutupTiket>;
  ambilRiwayatTelaah(noTiket: string): Promise<HasilTelaah[]>;
  ambilJadwal(noTiket: string): Promise<JadwalPemeriksaan[]>;
  ambilTanggapan(noTiket: string): Promise<TanggapanResmi[]>;
  /** ADR 0006: nomor lengkap pelapor dan status kontak tindak lanjut. */
  ambilKontakPelapor(noTiket: string): Promise<KontakPelapor>;
  tandaiSudahDihubungi(noTiket: string): Promise<ResponTandaiDihubungi>;
}

/** Implementasi tiruan (Mock) untuk pengujian dan fallback lokal tanpa basis data. */
export class PenyimpananPenangananMock implements PenyimpananPenanganan {
  tiketMap: Map<string, { status: string; jenis: string }>;
  telaahMap: Map<string, HasilTelaah[]>;
  jadwalMap: Map<string, JadwalPemeriksaan[]>;
  tanggapanMap: Map<string, TanggapanResmi[]>;
  notifikasiList: Array<{ tiketId: string; isi: string; status: string; dihubungiPada?: string }>;

  constructor(dataAwalTiket?: Record<string, { status: string; jenis: string }>) {
    this.tiketMap = new Map();
    this.telaahMap = new Map();
    this.jadwalMap = new Map();
    this.tanggapanMap = new Map();
    this.notifikasiList = [];

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

  async simpanTanggapan(noTiket: string, isi: string): Promise<ResponTanggapan> {
    const t = this.tiketMap.get(noTiket);
    if (!t) {
      throw new Error(`Tiket ${noTiket} tidak ditemukan.`);
    }
    if (t.status === 'diteruskan' || t.status === 'selesai') {
      throw new Error(`Tiket ${noTiket} sudah ${t.status} dan tidak dapat ditanggapi.`);
    }

    t.status = 'tanggapan_disusun';
    this.tiketMap.set(noTiket, t);

    const riwayat = this.tanggapanMap.get(noTiket) ?? [];
    const id = `tanggapan-${Date.now()}-${riwayat.length + 1}`;
    riwayat.unshift({
      id,
      tiketId: noTiket,
      noTiket,
      isi,
      petugasId: '00000000-0000-0000-0000-000000000099',
      petugasNama: 'Petugas Uji',
      status: 'tanggapan_disusun',
      waktu: new Date().toISOString(),
    });
    this.tanggapanMap.set(noTiket, riwayat);

    return {
      id,
      noTiket,
      status: 'tanggapan_disusun',
      pesan: PESAN_TANGGAPAN_TERSIMPAN,
    };
  }

  async tutupTiket(noTiket: string): Promise<ResponTutupTiket> {
    const t = this.tiketMap.get(noTiket);
    if (!t) {
      throw new Error(`Tiket ${noTiket} tidak ditemukan.`);
    }
    if (t.status === 'diteruskan') {
      throw new Error(`Tiket ${noTiket} sudah diteruskan ke instansi lain.`);
    }
    if (t.status === 'selesai') {
      return {
        noTiket,
        status: 'selesai',
        pesan: PESAN_TUTUP_TIKET,
      };
    }

    const daftarTanggapan = this.tanggapanMap.get(noTiket) ?? [];
    if (daftarTanggapan.length === 0) {
      throw new Error(PESAN_TUTUP_TANPA_TANGGAPAN);
    }

    t.status = 'selesai';
    this.tiketMap.set(noTiket, t);

    // Antrekan notifikasi hanya satu kali (idempoten)
    const sudahAntre = this.notifikasiList.some((n) => n.tiketId === noTiket);
    if (!sudahAntre) {
      this.notifikasiList.push({
        tiketId: noTiket,
        isi: daftarTanggapan[0].isi,
        status: 'tertunda',
      });
    }

    return {
      noTiket,
      status: 'selesai',
      pesan: PESAN_TUTUP_TIKET,
    };
  }

  async ambilRiwayatTelaah(noTiket: string): Promise<HasilTelaah[]> {
    return this.telaahMap.get(noTiket) ?? [];
  }

  async ambilJadwal(noTiket: string): Promise<JadwalPemeriksaan[]> {
    return this.jadwalMap.get(noTiket) ?? [];
  }

  async ambilTanggapan(noTiket: string): Promise<TanggapanResmi[]> {
    return this.tanggapanMap.get(noTiket) ?? [];
  }

  // Tiruan untuk pengembangan lokal: setiap tiket memakai satu nomor contoh.
  async ambilKontakPelapor(noTiket: string): Promise<KontakPelapor> {
    const n = this.notifikasiList.find((x) => x.tiketId === noTiket && x.status === 'terkirim');
    return { noTelp: '081234567890', sudahDihubungi: Boolean(n), dihubungiPada: n?.dihubungiPada ?? null };
  }

  async tandaiSudahDihubungi(noTiket: string): Promise<ResponTandaiDihubungi> {
    // Tiket contoh halaman pemantauan tidak ada di tiketMap; yang tidak dikenal dianggap boleh ditandai.
    const t = this.tiketMap.get(noTiket);
    if (t?.jenis === 'pengaduan' && t.status !== 'selesai') throw new Error(`Tiket ${noTiket} belum ditutup.`);
    if (t) t.status = 'selesai';
    const n = this.notifikasiList.find((x) => x.tiketId === noTiket);
    if (!n) this.notifikasiList.push({ tiketId: noTiket, isi: '', status: 'terkirim', dihubungiPada: new Date().toISOString() });
    else if (n.status !== 'terkirim') Object.assign(n, { status: 'terkirim', dihubungiPada: new Date().toISOString() });
    return { noTiket, status: 'selesai', pesan: PESAN_SUDAH_DIHUBUNGI };
  }
}

/** Adapter Supabase untuk memanggil RPC penanganan pengaduan. */
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

  async simpanTanggapan(noTiket: string, isi: string): Promise<ResponTanggapan> {
    const res = await this.klien.rpc('simpan_tanggapan', {
      p_no_tiket: noTiket,
      p_isi: isi,
    });
    if (res.error) throw res.error;
    const status = typeof res.data === 'string' ? res.data : String((res.data as Record<string, unknown>)?.status ?? 'tanggapan_disusun');
    return {
      noTiket,
      status,
      pesan: PESAN_TANGGAPAN_TERSIMPAN,
    };
  }

  async tutupTiket(noTiket: string): Promise<ResponTutupTiket> {
    const res = await this.klien.rpc('tutup_tiket', {
      p_no_tiket: noTiket,
    });
    if (res.error) throw res.error;
    const status = typeof res.data === 'string' ? res.data : String((res.data as Record<string, unknown>)?.status ?? 'selesai');
    return {
      noTiket,
      status,
      pesan: PESAN_TUTUP_TIKET,
    };
  }

  // RPC ambil_* mengembalikan larik jsonb ber-snake_case, terbaru lebih dulu (migrasi 20261104120000, 20261105130000).
  async ambil_(fn: string, noTiket: string): Promise<Record<string, unknown>[]> {
    const res = await this.klien.rpc(fn, { p_no_tiket: noTiket });
    if (res.error) throw res.error;
    return Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : [];
  }

  async ambilRiwayatTelaah(noTiket: string): Promise<HasilTelaah[]> {
    return (await this.ambil_('ambil_riwayat_telaah', noTiket)).map((r) => ({
      id: String(r.id), tiketId: String(r.tiket_id), noTiket,
      tindakLanjut: LABEL_TINDAK_LANJUT[String(r.tindak_lanjut)] ?? (String(r.tindak_lanjut) as TindakLanjut),
      catatan: (r.catatan as string | null) ?? null, petugasId: String(r.petugas_id),
      petugasNama: (r.petugas_nama as string | null) ?? null, waktu: String(r.waktu),
    }));
  }

  async ambilJadwal(noTiket: string): Promise<JadwalPemeriksaan[]> {
    return (await this.ambil_('ambil_jadwal_pemeriksaan', noTiket)).map((r) => ({
      id: String(r.id), tiketId: String(r.tiket_id), noTiket, tanggal: String(r.tanggal),
      unitPelaksana: String(r.unit_pelaksana), status: String(r.status), petugasId: String(r.petugas_id),
      petugasNama: (r.petugas_nama as string | null) ?? null, waktu: String(r.waktu),
    }));
  }

  async ambilTanggapan(noTiket: string): Promise<TanggapanResmi[]> {
    return (await this.ambil_('ambil_tanggapan', noTiket)).map((r) => ({
      id: String(r.id), tiketId: String(r.tiket_id), noTiket, isi: String(r.isi), petugasId: String(r.petugas_id),
      petugasNama: (r.petugas_nama as string | null) ?? null, status: String(r.status), waktu: String(r.waktu),
    }));
  }

  // RPC ambil_kontak_pelapor dan tandai_sudah_dihubungi mengembalikan jsonb yang sama (migrasi 20261124100000).
  async ambilKontakPelapor(noTiket: string): Promise<KontakPelapor> {
    const res = await this.klien.rpc('ambil_kontak_pelapor', { p_no_tiket: noTiket });
    if (res.error) throw res.error;
    const d = (res.data ?? {}) as Record<string, unknown>;
    return { noTelp: (d.no_telp as string | null) ?? null, sudahDihubungi: d.sudah_dihubungi === true, dihubungiPada: (d.dihubungi_pada as string | null) ?? null };
  }

  async tandaiSudahDihubungi(noTiket: string): Promise<ResponTandaiDihubungi> {
    const res = await this.klien.rpc('tandai_sudah_dihubungi', { p_no_tiket: noTiket });
    if (res.error) throw res.error;
    return { noTiket, status: 'selesai', pesan: PESAN_SUDAH_DIHUBUNGI };
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

  async simpanTanggapan(noTiket: string, isi: string): Promise<ResponTanggapan> {
    if (!noTiket || typeof noTiket !== 'string' || !noTiket.trim()) {
      throw new Error('Nomor tiket tidak valid.');
    }
    if (!isi || typeof isi !== 'string' || !isi.trim()) {
      throw new Error('Tanggapan wajib diisi.');
    }
    return this.penyimpanan.simpanTanggapan(noTiket.trim(), isi.trim());
  }

  async tutupTiket(noTiket: string): Promise<ResponTutupTiket> {
    if (!noTiket || typeof noTiket !== 'string' || !noTiket.trim()) {
      throw new Error('Nomor tiket tidak valid.');
    }
    return this.penyimpanan.tutupTiket(noTiket.trim());
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

  async ambilTanggapan(noTiket: string): Promise<TanggapanResmi[]> {
    if (!noTiket || typeof noTiket !== 'string' || !noTiket.trim()) {
      throw new Error('Nomor tiket tidak valid.');
    }
    return this.penyimpanan.ambilTanggapan(noTiket.trim());
  }

  async ambilKontakPelapor(noTiket: string): Promise<KontakPelapor> {
    if (!noTiket || typeof noTiket !== 'string' || !noTiket.trim()) {
      throw new Error('Nomor tiket tidak valid.');
    }
    return this.penyimpanan.ambilKontakPelapor(noTiket.trim());
  }

  async tandaiSudahDihubungi(noTiket: string): Promise<ResponTandaiDihubungi> {
    if (!noTiket || typeof noTiket !== 'string' || !noTiket.trim()) {
      throw new Error('Nomor tiket tidak valid.');
    }
    return this.penyimpanan.tandaiSudahDihubungi(noTiket.trim());
  }
}
