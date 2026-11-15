// Entity: antrean notifikasi SMS. `nomor_tiket` diantrekan saat tiket ADU/ESK terbit (REQ-2.4, REQ-1.7),
// `tindak_lanjut` saat tiket ditutup (T-F7.3-01, REQ-6.6). Sama dengan enum basis data di migrasi
// 20261105120000_antrean_notifikasi_tindak_lanjut.sql dan 20261115100000_jalur_sms_gateway.sql.

export const STATUS_KIRIM_NOTIFIKASI = ['tertunda', 'mengirim', 'terkirim', 'gagal'] as const;
export type StatusKirimNotifikasi = (typeof STATUS_KIRIM_NOTIFIKASI)[number];

export const JENIS_NOTIFIKASI = ['tindak_lanjut', 'nomor_tiket'] as const;
export type JenisNotifikasi = (typeof JENIS_NOTIFIKASI)[number];

/** Baris antrean yang sudah diklaim satu proses kirim. Nomor telepon hanya ada di sisi server. */
export interface NotifikasiDiklaim {
  id: string;
  jenis: JenisNotifikasi;
  noTiket: string;
  /** Null bila pengaduan dan penelepon tiket tidak punya nomor. */
  nomorTelepon: string | null;
}

export type HasilNotifikasi =
  | { id: string; status: 'terkirim'; isi: string }
  | { id: string; status: 'gagal'; galat: string };
