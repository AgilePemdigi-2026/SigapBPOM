// Entity UC-06: notifikasi SMS tindak lanjut yang diantrekan saat tiket ditutup (T-F7.3-01, REQ-6.6).
// Sama dengan enum basis data di migrasi 20261105120000_antrean_notifikasi_tindak_lanjut.sql.

export const STATUS_KIRIM_NOTIFIKASI = ['tertunda', 'mengirim', 'terkirim', 'gagal'] as const;
export type StatusKirimNotifikasi = (typeof STATUS_KIRIM_NOTIFIKASI)[number];

export const JENIS_NOTIFIKASI = ['tindak_lanjut'] as const;
export type JenisNotifikasi = (typeof JENIS_NOTIFIKASI)[number];

/** Baris antrean yang sudah diklaim satu proses kirim. Nomor telepon hanya ada di sisi server. */
export interface NotifikasiDiklaim {
  id: string;
  noTiket: string;
  /** Null bila pengaduan dan penelepon tiket tidak punya nomor. */
  nomorTelepon: string | null;
}

export type HasilNotifikasi =
  | { id: string; status: 'terkirim'; isi: string }
  | { id: string; status: 'gagal'; galat: string };
