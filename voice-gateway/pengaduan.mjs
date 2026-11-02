// Control UC-02 Menyampaikan Pengaduan Produk di Voice Gateway (REQ-2.1, REQ-2.2, REQ-2.3, REQ-2.4, REQ-2.5, BR-1).
// Nama kelas mengikuti class diagram SRS. Tanpa I/O langsung: layanan eksternal lewat interface agar bisa diuji dengan `node --test`.

/** Nilai enum `jenis_interaksi` di basis data (supabase/migrations/20261020131737_inti_percakapan.sql). */
export const JENIS_INTERAKSI = Object.freeze({ INFORMASI_PRODUK: 'informasi_produk', PENGADUAN: 'pengaduan' });

/** Nomor menu: tekan 1 = informasi produk (UC-01), tekan 2 = pengaduan (UC-02). Kamus pesan Lampiran A. */
export const LAYANAN_INFORMASI_PRODUK = 1;
export const LAYANAN_PENGADUAN = 2;

/** Jenis interaksi percakapan untuk nomor menu yang dipilih, atau null bila tidak dikenal. */
export const jenisInteraksiDariMenu = (nomor) =>
  nomor === LAYANAN_INFORMASI_PRODUK ? JENIS_INTERAKSI.INFORMASI_PRODUK : nomor === LAYANAN_PENGADUAN ? JENIS_INTERAKSI.PENGADUAN : null;

const SESI_PENGADUAN_MAKS = 500;

export class PengaduanController {
  constructor() {
    // Status pengumpulan data per panggilan. Hanya ada selama pengaduan berjalan.
    this.sesi = new Map();
  }

  /** Penelepon menekan 2: mulai pengumpulan data pengaduan pada panggilan ini. */
  mulai(id) {
    this.sesi.delete(id);
    if (this.sesi.size >= SESI_PENGADUAN_MAKS) this.sesi.delete(this.sesi.keys().next().value);
    this.sesi.set(id, { data: {}, ditanya: null, tiket: null });
  }

  /** Penelepon kembali ke menu atau memilih layanan lain: alur pengaduan dibuang. */
  batal(id) {
    this.sesi.delete(id);
  }

  /** Panggilan sedang dalam alur pengaduan yang belum selesai. */
  aktif(id) {
    const s = this.sesi.get(id);
    return Boolean(s) && s.tiket === null;
  }
}
