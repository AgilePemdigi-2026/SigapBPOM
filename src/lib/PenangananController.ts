// Control UC-06 Menangani Pengaduan (REQ-6.1 sampai REQ-6.6, BR-2, BR-3, T-F7.2-03). Nama kelas dan metodenya mengikuti
// class diagram SRS Gambar B.2. Tiket diidentifikasi dengan nomor tiket karena RPC #98 dan #100 memakai p_no_tiket.
// Mesin status ditegakkan oleh RPC; control memvalidasi isian dan memetakan penolakan ke pesan kamus.
import { LABEL_STATUS_TIKET, type StatusTiket } from './PemantauanLayananController.ts';

/** Nilai enum keputusan_tindak_lanjut (REQ-6.1). */
export type TindakLanjut = 'telaah_dokumen' | 'perlu_pemeriksaan_lapangan' | 'bukan_kewenangan_bpom';

/** Label pilihan "Tindak Lanjut", PRD-rinci REQ-6.1. */
export const LABEL_TINDAK_LANJUT: Record<TindakLanjut, string> = {
  telaah_dokumen: 'Telaah Dokumen',
  perlu_pemeriksaan_lapangan: 'Perlu Pemeriksaan Lapangan',
  bukan_kewenangan_bpom: 'Bukan Kewenangan BPOM',
};

/** Kamus pesan PRD-rinci Lampiran A, UC-06 dan UC-04 "Tiket tidak ditemukan". */
export const PESAN_PENANGANAN = {
  telaahTersimpan: 'Hasil telaah tersimpan.',
  diteruskan: 'Pengaduan diteruskan ke instansi lain.',
  jadwalTersimpan: 'Jadwal pemeriksaan tersimpan.',
  tanggapanTersimpan: 'Tanggapan tersimpan.',
  tiketDitutup: 'Tiket ditutup.',
  tutupTanpaTanggapan: 'Tiket tidak dapat ditutup. Susun tanggapan terlebih dahulu.',
  tiketTidakDitemukan: 'Tiket tidak ditemukan.',
} as const;

// Kamus UC-06 belum punya pesan untuk isian tidak sah, transisi yang ditolak, dan galat sistem; dipakai pesan yang sama
// dengan endpoint simpan-materi dan middleware.
const PESAN_TIDAK_VALID = 'Permintaan tidak valid.';
const PESAN_AKSES_DITOLAK = 'Akses ditolak.';
const PESAN_SISTEM = 'Terjadi kesalahan pada sistem.';

/** Alasan penolakan dari penyimpanan, dipetakan control ke kode HTTP dan pesan. */
export type AlasanTolak = 'input_tidak_sah' | 'akses_ditolak' | 'tiket_tidak_ada' | 'transisi_tidak_sah' | 'tanpa_tanggapan';

export class GalatPenanganan extends Error {
  alasan: AlasanTolak;

  constructor(alasan: AlasanTolak) {
    super(alasan);
    this.alasan = alasan;
  }
}

/**
 * Penyimpanan penanganan (PROJECT_RULES 4.3): RPC Supabase dengan token petugas, atau tiruan untuk pengembangan lokal.
 * Setiap aksi mengembalikan status tiket sesudahnya (null bila tidak dilaporkan) dan melempar GalatPenanganan bila ditolak.
 */
export interface PenyimpananPenanganan {
  simpanTelaah(noTiket: string, tindakLanjut: TindakLanjut, catatan: string): Promise<StatusTiket | null>;
  simpanJadwal(noTiket: string, tanggal: string, unit: string): Promise<StatusTiket | null>;
  simpanTanggapan(noTiket: string, isi: string): Promise<StatusTiket | null>;
  tutupTiket(noTiket: string): Promise<StatusTiket | null>;
}

export type DataPenanganan = { noTiket: string; status: StatusTiket | null; labelStatus: string | null };

/** `kode` adalah kode HTTP (PROJECT_RULES 4.4). */
export type HasilPenanganan = { kode: 200 | 400 | 403 | 404 | 422 | 500; pesan: string; data: DataPenanganan | null };

const PENOLAKAN: Record<AlasanTolak, Pick<HasilPenanganan, 'kode' | 'pesan'>> = {
  input_tidak_sah: { kode: 400, pesan: PESAN_TIDAK_VALID },
  akses_ditolak: { kode: 403, pesan: PESAN_AKSES_DITOLAK },
  tiket_tidak_ada: { kode: 404, pesan: PESAN_PENANGANAN.tiketTidakDitemukan },
  transisi_tidak_sah: { kode: 422, pesan: PESAN_TIDAK_VALID },
  tanpa_tanggapan: { kode: 422, pesan: PESAN_PENANGANAN.tutupTanpaTanggapan },
};

// Sama dengan check constraint tiket.no_tiket (migrasi inti_percakapan).
const POLA_NO_TIKET = /^(ADU|ESK)-\d{8}-\d{4}$/;
// PROJECT_RULES 5.6: panjang isian dibatasi sebelum diteruskan ke basis data.
const PANJANG_CATATAN_MAKS = 2000;
const PANJANG_UNIT_MAKS = 100;
const PANJANG_TANGGAPAN_MAKS = 5000;

const noTiketSah = (v: unknown): v is string => typeof v === 'string' && POLA_NO_TIKET.test(v);
const tindakLanjutSah = (v: unknown): v is TindakLanjut => typeof v === 'string' && Object.hasOwn(LABEL_TINDAK_LANJUT, v);

/** Teks terpangkas, atau null bila bukan teks, kosong padahal `wajib`, atau terlalu panjang. Nilai tidak ada dianggap kosong. */
function teks(nilai: unknown, panjangMaks: number, wajib: boolean): string | null {
  const v = nilai ?? '';
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return (wajib && !t) || t.length > panjangMaks ? null : t;
}

/** Tanggal kalender YYYY-MM-DD (nilai <input type="date">), atau null bila tidak sah, misalnya 2026-02-30. */
function tanggal(nilai: unknown): string | null {
  if (typeof nilai !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(nilai)) return null;
  const d = new Date(`${nilai}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(nilai) ? nilai : null;
}

const DITOLAK: HasilPenanganan = { ...PENOLAKAN.input_tidak_sah, data: null };

export class PenangananController {
  penyimpanan: PenyimpananPenanganan;

  constructor(penyimpanan: PenyimpananPenanganan) {
    this.penyimpanan = penyimpanan;
  }

  async jalankan(noTiket: string, pesan: string, aksi: () => Promise<StatusTiket | null>): Promise<HasilPenanganan> {
    try {
      const status = await aksi();
      return { kode: 200, pesan, data: { noTiket, status, labelStatus: status && LABEL_STATUS_TIKET[status] } };
    } catch (e) {
      return e instanceof GalatPenanganan ? { ...PENOLAKAN[e.alasan], data: null } : { kode: 500, pesan: PESAN_SISTEM, data: null };
    }
  }

  /** REQ-6.1, REQ-6.2, BR-3: Bukan Kewenangan BPOM meneruskan pengaduan dan menghentikan penanganannya. */
  async simpanTelaah(noTiket: unknown, tindakLanjut: unknown, catatan: unknown): Promise<HasilPenanganan> {
    const c = teks(catatan, PANJANG_CATATAN_MAKS, false);
    if (!noTiketSah(noTiket) || !tindakLanjutSah(tindakLanjut) || c === null) return DITOLAK;
    const pesan = tindakLanjut === 'bukan_kewenangan_bpom' ? PESAN_PENANGANAN.diteruskan : PESAN_PENANGANAN.telaahTersimpan;
    return this.jalankan(noTiket, pesan, () => this.penyimpanan.simpanTelaah(noTiket, tindakLanjut, c));
  }

  /** REQ-6.3: jadwal pemeriksaan lapangan membuat tiket berstatus Menunggu Pemeriksaan. */
  async simpanJadwal(noTiket: unknown, tanggalPemeriksaan: unknown, unitPelaksana: unknown): Promise<HasilPenanganan> {
    const tgl = tanggal(tanggalPemeriksaan);
    const unit = teks(unitPelaksana, PANJANG_UNIT_MAKS, true);
    if (!noTiketSah(noTiket) || tgl === null || unit === null) return DITOLAK;
    return this.jalankan(noTiket, PESAN_PENANGANAN.jadwalTersimpan, () => this.penyimpanan.simpanJadwal(noTiket, tgl, unit));
  }

  /** REQ-6.4: tanggapan resmi kosong ditolak, karena tanggapan adalah syarat penutupan tiket (BR-2). */
  async simpanTanggapan(noTiket: unknown, isi: unknown): Promise<HasilPenanganan> {
    const tanggapan = teks(isi, PANJANG_TANGGAPAN_MAKS, true);
    if (!noTiketSah(noTiket) || tanggapan === null) return DITOLAK;
    return this.jalankan(noTiket, PESAN_PENANGANAN.tanggapanTersimpan, () => this.penyimpanan.simpanTanggapan(noTiket, tanggapan));
  }

  /** REQ-6.5, REQ-6.6, BR-2: tiket tanpa tanggapan ditolak; SMS dikirim dari notifikasi yang diantrekan RPC (T-F7.3-01). */
  async tutupTiket(noTiket: unknown): Promise<HasilPenanganan> {
    if (!noTiketSah(noTiket)) return DITOLAK;
    return this.jalankan(noTiket, PESAN_PENANGANAN.tiketDitutup, () => this.penyimpanan.tutupTiket(noTiket));
  }
}
