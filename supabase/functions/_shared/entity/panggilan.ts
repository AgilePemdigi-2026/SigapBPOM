// Entity UC-04: panggilan berjalan yang dipantau dashboard (T-F5.2-02, REQ-4.2).
// Daftar tahap harus sama dengan check constraint percakapan_tahap_ai_check dan RPC laporkan_panggilan_aktif di migrasi,
// serta salinan TAHAP di voice-gateway/panggilanAktif.mjs.

/** Tahap pemrosesan AI pada panggilan berjalan (REQ-4.2). */
export const TAHAP_AI = ['mendengar', 'memproses', 'menjawab'] as const;
export type TahapAi = (typeof TAHAP_AI)[number];

/** Jenis layanan panggilan, sama dengan enum jenis_interaksi. */
export const JENIS_LAYANAN = ['informasi_produk', 'pengaduan'] as const;
export type JenisLayanan = (typeof JENIS_LAYANAN)[number];
