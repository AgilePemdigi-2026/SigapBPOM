// Control pengiriman semua SMS SIGAP lewat satu antrean: nomor tiket saat tiket ADU/ESK terbit (REQ-2.4, REQ-1.7)
// dan tindak lanjut saat tiket ditutup (T-F7.3-01, REQ-6.6). Basis data hanya mengantrekan; kelas ini mengklaim
// antrean, mengirim lewat PengirimSms, dan mencatat hasilnya. Tidak memakai API khusus Deno agar bisa diuji dengan
// `node --test` tanpa basis data.
import type { HasilNotifikasi, JenisNotifikasi, NotifikasiDiklaim } from '../entity/notifikasi.ts';
import { samarkanNomorTelepon } from '../entity/penelepon.ts';

/** Layanan SMS Gateway (PROJECT_RULES 4.3). Implementasi di adapter/sms.ts. */
export interface PengirimSms {
  kirim(nomorTelepon: string, teks: string): Promise<void>;
}

export interface PenyimpananNotifikasi {
  /** Mengklaim baris tertunda atau gagal (tidak pernah yang terkirim) dan menandainya sedang dikirim. */
  klaimNotifikasiTertunda(batas: number, batasPercobaan: number): Promise<NotifikasiDiklaim[]>;
  /** Mencatat hasil kirim untuk baris yang sedang diklaim. */
  catatHasilNotifikasi(hasil: HasilNotifikasi): Promise<void>;
}

/** Jumlah notifikasi paling banyak dalam satu putaran antrean, agar satu panggilan Edge Function tetap singkat. */
export const BATAS_KLAIM_PER_PUTARAN = 20;

/** Notifikasi yang sudah gagal sebanyak ini tidak diklaim lagi dan perlu diperiksa petugas teknis. */
export const BATAS_PERCOBAAN_KIRIM = 5;

const PANJANG_MAKS_GALAT = 200;

export const GALAT_NOMOR_TIDAK_TERSEDIA = 'Nomor telepon pelapor tidak tersedia.';

/**
 * Teks SMS tindak lanjut (REQ-6.6). Belum tercantum di kamus pesan PRD-rinci Lampiran A; tambahkan ke kamus lewat
 * PR docs, lalu samakan teks ini persis dengan kamus.
 */
export function teksSmsTindakLanjut(noTiket: string): string {
  return `Pengaduan Anda dengan nomor tiket ${noTiket} telah selesai ditindaklanjuti. Terima kasih telah menghubungi HaloBPOM.`;
}

/**
 * Teks SMS per jenis notifikasi. Nomor tiket memakai kamus pesan Lampiran A yang sama dengan yang diucapkan gateway
 * (voice-gateway/pengaduan.mjs pesanTiketPengaduan, eskalasi.mjs pesanTiketEskalasi); tes menjaga keduanya tetap sama.
 */
export function teksSms(jenis: JenisNotifikasi, noTiket: string): string {
  if (jenis === 'tindak_lanjut') return teksSmsTindakLanjut(noTiket);
  return noTiket.startsWith('ESK-')
    ? `Nomor tiket Anda ${noTiket}. Jawaban petugas akan dikirim melalui SMS.`
    : `Pengaduan Anda telah dicatat dengan nomor tiket ${noTiket}. Tindak lanjut akan dikirim melalui SMS.`;
}

export interface RingkasanPutaran {
  diproses: number;
  terkirim: number;
  gagal: number;
}

export class PenangananController {
  penyimpanan: PenyimpananNotifikasi;
  pengirimSms: PengirimSms;

  constructor(penyimpanan: PenyimpananNotifikasi, pengirimSms: PengirimSms) {
    this.penyimpanan = penyimpanan;
    this.pengirimSms = pengirimSms;
  }

  /**
   * Satu putaran antrean SMS (nomor tiket dan tindak lanjut). Aman diulang: notifikasi terkirim tidak pernah diklaim lagi,
   * dan notifikasi gagal dikirim ulang pada putaran berikutnya sampai BATAS_PERCOBAAN_KIRIM.
   */
  async kirimNotifikasi(): Promise<RingkasanPutaran> {
    const antrean = await this.penyimpanan.klaimNotifikasiTertunda(BATAS_KLAIM_PER_PUTARAN, BATAS_PERCOBAAN_KIRIM);
    const ringkasan: RingkasanPutaran = { diproses: antrean.length, terkirim: 0, gagal: 0 };
    for (const n of antrean) {
      const hasil = await this.kirimSatu(n);
      await this.penyimpanan.catatHasilNotifikasi(hasil);
      ringkasan[hasil.status]++;
      // Log hanya nomor tiket, nomor tersamar, dan status (PROJECT_RULES 5.10).
      const tujuan = n.nomorTelepon ? samarkanNomorTelepon(n.nomorTelepon) : '-';
      console.info('notifikasi', n.jenis, n.noTiket, tujuan, hasil.status);
    }
    return ringkasan;
  }

  async kirimSatu(n: NotifikasiDiklaim): Promise<HasilNotifikasi> {
    if (!n.nomorTelepon) return { id: n.id, status: 'gagal', galat: GALAT_NOMOR_TIDAK_TERSEDIA };
    const isi = teksSms(n.jenis, n.noTiket);
    try {
      await this.pengirimSms.kirim(n.nomorTelepon, isi);
      return { id: n.id, status: 'terkirim', isi };
    } catch (e) {
      // Pesan galat gateway bisa memuat nomor tujuan; disamarkan sebelum disimpan.
      const pesan = e instanceof Error && e.message ? e.message : 'Gagal mengirim.';
      return { id: n.id, status: 'gagal', galat: samarkanNomorTelepon(pesan).slice(0, PANJANG_MAKS_GALAT) };
    }
  }
}
