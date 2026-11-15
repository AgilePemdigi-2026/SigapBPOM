// Adapter SMS Gateway (PROJECT_RULES 4.3): satu interface, implementasi tiruan untuk lokal dan Zenziva untuk cloud
// (T-F7.3-01, REQ-6.6).
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

/** Alamat kirim SMS Zenziva (dokumentasi zenziva.id: POST {CONSOLE_BASEURL}/masking/api/sendsms/). */
export const URL_ZENZIVA_BAWAAN = 'https://console.zenziva.net/masking/api/sendsms/';
// Satu putaran mengirim sampai BATAS_KLAIM_PER_PUTARAN (20) SMS berurutan; 5 detik per SMS menjaga satu putaran tetap
// di bawah batas waktu Edge Function.
const BATAS_WAKTU_ZENZIVA_MS = 5000;

/**
 * Pengirim SMS lewat HTTP API Zenziva. Respons sukses `{ status: "1", text: "Success" }`; status lain dianggap gagal
 * dan `text` dari Zenziva menjadi galat_terakhir (tanpa nomor tujuan dan tanpa kunci API).
 */
export class PengirimSmsZenziva implements PengirimSms {
  userkey: string;
  passkey: string;
  url: string;
  ambil: typeof fetch;

  constructor(userkey: string, passkey: string, url = URL_ZENZIVA_BAWAAN, ambil: typeof fetch = fetch) {
    this.userkey = userkey;
    this.passkey = passkey;
    this.url = url;
    this.ambil = ambil;
  }

  async kirim(nomorTelepon: string, teks: string) {
    let res: Response;
    try {
      res = await this.ambil(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ userkey: this.userkey, passkey: this.passkey, to: nomorTelepon, message: teks }),
        signal: AbortSignal.timeout(BATAS_WAKTU_ZENZIVA_MS),
      });
    } catch {
      throw new Error('Zenziva tidak dapat dihubungi.');
    }
    const hasil = (await res.json().catch(() => null)) as { status?: unknown; text?: unknown } | null;
    if (res.ok && String(hasil?.status) === '1') return;
    const alasan = typeof hasil?.text === 'string' && hasil.text.trim() ? hasil.text.trim().slice(0, 120) : `HTTP ${res.status}`;
    throw new Error(`Zenziva menolak: ${alasan}`);
  }
}

/**
 * Memilih adapter dari env `SMS_ADAPTER`:
 * - `zenziva`: kirim sungguhan; butuh `ZENZIVA_USERKEY` dan `ZENZIVA_PASSKEY`, `ZENZIVA_URL` opsional.
 * - `tiruan`: tidak mengirim apa pun, untuk lokal saja.
 * Env kosong ditolak: tiruan menandai SMS "terkirim", jadi di cloud ia harus dipilih secara sadar, bukan bawaan.
 */
export function buatPengirimSms(mode: string | undefined, env: (nama: string) => string | undefined = () => undefined): PengirimSms {
  const pilihan = mode?.trim();
  if (!pilihan) throw new Error('SMS_ADAPTER belum diatur.');
  if (pilihan === 'tiruan') return new PengirimSmsTiruan();
  if (pilihan === 'zenziva') {
    const userkey = env('ZENZIVA_USERKEY')?.trim();
    const passkey = env('ZENZIVA_PASSKEY')?.trim();
    if (!userkey || !passkey) throw new Error('ZENZIVA_USERKEY dan ZENZIVA_PASSKEY wajib diisi.');
    return new PengirimSmsZenziva(userkey, passkey, env('ZENZIVA_URL')?.trim() || URL_ZENZIVA_BAWAAN);
  }
  throw new Error(`Adapter SMS "${pilihan}" belum tersedia.`);
}
