// Adapter SMS Gateway (PROJECT_RULES 4.3): satu interface, implementasi tiruan untuk lokal, Zenziva untuk produksi,
// dan HP Android (SMS Gateway for Android, sms-gate.app) untuk demo tanpa deposit (T-F7.3-01, REQ-6.6).
import { GalatSmsTidakPasti, type PengirimSms } from '../control/PenangananController.ts';

export { GalatSmsTidakPasti, type PengirimSms };

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
 * dan `text` dari Zenziva menjadi galat_terakhir (tanpa nomor tujuan dan tanpa kunci API). Batas waktu habis atau
 * balasan 2xx yang tidak terbaca menjadi GalatSmsTidakPasti, sehingga SMS tidak dikirim ulang.
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
    } catch (e) {
      // Batas waktu habis setelah permintaan terkirim: Zenziva mungkin sudah meneruskan SMS-nya.
      if (e instanceof DOMException && e.name === 'TimeoutError') throw new GalatSmsTidakPasti('Zenziva tidak menjawab dalam batas waktu.');
      throw new Error('Zenziva tidak dapat dihubungi.');
    }
    let hasil: { status?: unknown; text?: unknown } | null = null;
    try {
      hasil = await res.json();
    } catch {
      // Zenziva menerima permintaan (2xx) tetapi balasannya tidak terbaca: hasil kirim tidak diketahui.
      if (res.ok) throw new GalatSmsTidakPasti('Balasan Zenziva tidak terbaca.');
    }
    if (res.ok && String(hasil?.status) === '1') return;
    const alasan = typeof hasil?.text === 'string' && hasil.text.trim() ? hasil.text.trim().slice(0, 120) : `HTTP ${res.status}`;
    throw new Error(`Zenziva menolak: ${alasan}`);
  }
}

/** Alamat kirim SMS Gateway for Android mode Cloud (docs.sms-gate.app/integration/api). */
export const URL_SMSGATE_BAWAAN = 'https://api.sms-gate.app/3rdparty/v1/messages';
const BATAS_WAKTU_SMSGATE_MS = 5000;

/** Nomor tersimpan berawalan 0 (entity/penelepon.ts); sms-gate.app meminta format E.164. */
export const keE164 = (nomor: string) => nomor.replace(/^0/, '+62');

/**
 * Pengirim SMS lewat HP Android yang menjalankan aplikasi SMS Gateway for Android (sms-gate.app), memakai SIM dan
 * paket SMS HP itu sendiri. Server sms-gate.app hanya mengantrekan pesan lalu meneruskannya ke HP, jadi respons 2xx
 * berarti "masuk antrean HP", bukan "sampai ke penelepon".
 * ponytail: jalur P2P dari SIM pribadi, cukup untuk demo. Produksi wajib penyedia A2P resmi (Zenziva) dengan nama
 * pengirim terdaftar.
 */
export class PengirimSmsAndroid implements PengirimSms {
  otorisasi: string;
  url: string;
  ambil: typeof fetch;

  constructor(username: string, password: string, url = URL_SMSGATE_BAWAAN, ambil: typeof fetch = fetch) {
    this.otorisasi = `Basic ${btoa(`${username}:${password}`)}`;
    this.url = url;
    this.ambil = ambil;
  }

  async kirim(nomorTelepon: string, teks: string) {
    let res: Response;
    try {
      res = await this.ambil(this.url, {
        method: 'POST',
        headers: { authorization: this.otorisasi, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ textMessage: { text: teks }, phoneNumbers: [keE164(nomorTelepon)] }),
        signal: AbortSignal.timeout(BATAS_WAKTU_SMSGATE_MS),
      });
    } catch (e) {
      // Batas waktu habis setelah permintaan terkirim: pesan mungkin sudah masuk antrean HP.
      if (e instanceof DOMException && e.name === 'TimeoutError') throw new GalatSmsTidakPasti('SMS Gateway Android tidak menjawab dalam batas waktu.');
      throw new Error('SMS Gateway Android tidak dapat dihubungi.');
    }
    if (res.ok) return;
    let alasan = `HTTP ${res.status}`;
    try {
      const hasil = await res.json();
      if (typeof hasil?.message === 'string' && hasil.message.trim()) alasan = `${alasan} ${hasil.message.trim().slice(0, 120)}`;
    } catch { /* badan galat bukan JSON: cukup kode HTTP */ }
    throw new Error(`SMS Gateway Android menolak: ${alasan}`);
  }
}

/** userkey/passkey dan Basic auth ikut di setiap permintaan, jadi alamatnya tidak boleh http biasa. */
function wajibHttps(url: string, nama: string) {
  if (!url.startsWith('https://')) throw new Error(`${nama} harus diawali https://.`);
  return url;
}

/**
 * Memilih adapter dari env `SMS_ADAPTER`:
 * - `zenziva`: kirim sungguhan; butuh `ZENZIVA_USERKEY` dan `ZENZIVA_PASSKEY`, `ZENZIVA_URL` opsional.
 * - `android`: kirim lewat HP Android (sms-gate.app); butuh `SMSGATE_USERNAME` dan `SMSGATE_PASSWORD` dari aplikasi,
 *   `SMSGATE_URL` opsional (server sendiri).
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
    const url = wajibHttps(env('ZENZIVA_URL')?.trim() || URL_ZENZIVA_BAWAAN, 'ZENZIVA_URL');
    return new PengirimSmsZenziva(userkey, passkey, url);
  }
  if (pilihan === 'android') {
    const username = env('SMSGATE_USERNAME')?.trim();
    const password = env('SMSGATE_PASSWORD')?.trim();
    if (!username || !password) throw new Error('SMSGATE_USERNAME dan SMSGATE_PASSWORD wajib diisi.');
    const url = wajibHttps(env('SMSGATE_URL')?.trim() || URL_SMSGATE_BAWAAN, 'SMSGATE_URL');
    return new PengirimSmsAndroid(username, password, url);
  }
  throw new Error(`Adapter SMS "${pilihan}" belum tersedia.`);
}
