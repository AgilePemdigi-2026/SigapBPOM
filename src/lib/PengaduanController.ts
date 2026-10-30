// Control UC-04/UC-06: detail pengaduan yang dibuka dari tombol "Buka Kasus" (REQ-4.4, T-F5.3-03). Read-only;
// telaah, tanggapan, dan tutup tiket menyusul di Sprint 3.
import { LABEL_JENIS_INTERAKSI, LABEL_JENIS_TIKET, LABEL_STATUS_TIKET, type JenisInteraksi, type JenisTiket, type StatusTiket } from './PemantauanLayananController.ts';

/** Satu tiket beserta percakapan dan penelepon tersamarnya. Waktu berformat ISO 8601. */
export type PengaduanTersimpan = {
  noTiket: string;
  jenis: JenisTiket;
  status: StatusTiket;
  ringkasan: string | null;
  tglTerbit: string;
  percakapanId: string;
  waktuMulai: string;
  jenisInteraksi: JenisInteraksi | null;
  topik: string | null;
  /** Sudah disamarkan di server (NFR-13, view penelepon_tersamar). */
  namaPelapor: string | null;
  noTelp: string | null;
};

/** Penyimpanan tiket (PROJECT_RULES 4.3): Supabase lewat sesi petugas, atau tiruan. */
export interface PenyimpananPengaduan {
  /** null bila tiket tidak ada atau tidak boleh dibaca petugas. */
  detail(noTiket: string): Promise<PengaduanTersimpan | null>;
}

/** Kamus pesan PRD-rinci Lampiran A, UC-04. */
export const PESAN_PENGADUAN = {
  tidakDitemukan: 'Tiket tidak ditemukan.',
  gagalDimuat: 'Data pengaduan gagal dimuat. Muat ulang halaman untuk mencoba lagi.',
} as const;

// Format nomor tiket mengikuti check constraint tabel tiket.
const POLA_NO_TIKET = /^(ADU|ESK)-[0-9]{8}-[0-9]{4}$/;

export type DetailPengaduan = {
  noTiket: string;
  jenis: string;
  status: StatusTiket;
  labelStatus: string;
  ringkasan: string;
  tglTerbit: string;
  waktuPanggilan: string;
  jenisLayanan: string;
  topik: string;
  namaPelapor: string;
  noTelp: string;
  tautanTranskrip: string;
};

const waktuTampil = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso))
    .replace(/\./g, ':')
    .concat(' WIB');

// Hanya nilai yang sudah tersamar yang boleh tampil (NFR-13).
const tersamar = (s: string | null) => (s && s.includes('*') ? s : '—');

export class PengaduanController {
  penyimpanan: PenyimpananPengaduan;

  constructor(penyimpanan: PenyimpananPengaduan) {
    this.penyimpanan = penyimpanan;
  }

  async detailPengaduan(noTiket: unknown): Promise<DetailPengaduan | { gagal: string }> {
    const no = typeof noTiket === 'string' ? noTiket.trim().toUpperCase() : '';
    if (!POLA_NO_TIKET.test(no)) return { gagal: PESAN_PENGADUAN.tidakDitemukan };
    let t: PengaduanTersimpan | null;
    try {
      t = await this.penyimpanan.detail(no);
    } catch {
      return { gagal: PESAN_PENGADUAN.gagalDimuat };
    }
    if (!t) return { gagal: PESAN_PENGADUAN.tidakDitemukan };
    return {
      noTiket: t.noTiket,
      jenis: LABEL_JENIS_TIKET[t.jenis],
      status: t.status,
      labelStatus: LABEL_STATUS_TIKET[t.status],
      ringkasan: t.ringkasan ?? '—',
      tglTerbit: waktuTampil(t.tglTerbit),
      waktuPanggilan: waktuTampil(t.waktuMulai),
      jenisLayanan: t.jenisInteraksi ? LABEL_JENIS_INTERAKSI[t.jenisInteraksi] : '—',
      topik: t.topik ?? '—',
      namaPelapor: tersamar(t.namaPelapor),
      noTelp: tersamar(t.noTelp),
      tautanTranskrip: `/riwayat-percakapan/detail?id=${encodeURIComponent(t.percakapanId)}`,
    };
  }
}
