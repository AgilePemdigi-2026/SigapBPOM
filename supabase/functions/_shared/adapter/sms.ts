// Adapter SMS Gateway (PROJECT_RULES 4.3): satu interface, implementasi tiruan dan titik pasang adapter resmi
// (T-F7.3-01, REQ-6.6). Penyedia SMS Gateway masih menunggu pengadaan (PRD-rinci Bagian 15 butir 2), jadi
// hanya tiruan yang tersedia.
import type { PengirimSms } from '../control/PenangananController.ts';

export type { PengirimSms };

/**
 * Pengirim SMS tiruan: tidak mengirim apa pun, hanya mencatat pesan di memori. Bisa diminta gagal untuk menguji
 * pencatatan galat dan pengulangan. Tidak menulis nomor ke log.
 */
export class PengirimSmsTiruan implements PengirimSms {
  terkirim: { nomorTelepon: string; teks: string }[] = [];
  /** Jumlah panggilan berikutnya yang dibuat gagal. */
  gagalBerikutnya = 0;
  galat = 'SMS Gateway tiruan diminta gagal.';

  gagalkan(jumlah = 1, galat?: string) {
    this.gagalBerikutnya = jumlah;
    if (galat) this.galat = galat;
  }

  async kirim(nomorTelepon: string, teks: string) {
    if (this.gagalBerikutnya > 0) {
      this.gagalBerikutnya--;
      throw new Error(this.galat);
    }
    this.terkirim.push({ nomorTelepon, teks });
  }
}

/**
 * Memilih adapter dari env `SMS_ADAPTER`. Titik pasang adapter resmi: setelah tim memutuskan penyedia SMS Gateway,
 * buat kelas `PengirimSmsResmi implements PengirimSms` di berkas ini (REST/HTTPS, TLS 1.2+, kredensial dari env)
 * dan kembalikan untuk mode `resmi`. Sampai saat itu mode `resmi` ditolak agar tiruan tidak dikira gateway sungguhan.
 */
export function buatPengirimSms(mode: string | undefined): PengirimSms {
  const pilihan = mode?.trim() || 'tiruan';
  if (pilihan === 'tiruan') return new PengirimSmsTiruan();
  throw new Error(`Adapter SMS "${pilihan}" belum tersedia.`);
}
