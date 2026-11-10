// Control UC-01 alur eskalasi (T-F1.4-03, REQ-1.7, NFR-6): pertanyaan medis atau keamanan konsumsi tidak dijawab AI,
// melainkan diteruskan ke petugas dengan tiket ESK. Seluruh alur memakai pesan baku tanpa memanggil AI.
import { KODE_IZIN_EDAR, kueriProduk } from './cekbpom.mjs';

/** Kamus pesan Lampiran A (UC-01 "Butuh petugas"). */
export const PESAN_BUTUH_PETUGAS = 'Pertanyaan Anda akan diteruskan kepada petugas. Mohon sebutkan nomor telepon Anda.';
/** Bagian kedua pesan "Butuh petugas", dipakai saat nomor tidak valid. Sama dengan pesan 422 Edge Function. */
export const PESAN_MINTA_ULANG_TELEPON = 'Mohon sebutkan nomor telepon Anda.';
/** Kamus pesan Lampiran A (UC-01 "Tiket eskalasi terbit"). */
export const pesanTiketEskalasi = (nomorTiket) => `Nomor tiket Anda ${nomorTiket}. Jawaban petugas akan dikirim melalui SMS.`;

const sederhanakan = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

const KONDISI = 'hamil|menyusui|bayi|balita|anak|lansia|penderita|darah tinggi|diabetes|maag|asma|jantung|ginjal';
// Nasihat medis, dosis, dan penilaian keamanan konsumsi untuk kondisi tertentu butuh penilaian petugas (NFR-6).
const POLA_MEDIS = [
  new RegExp(`\\b(aman|bahaya|berbahaya|boleh|bisa|cocok|sesuai)\\b.*\\b(${KONDISI})\\b`),
  // "... untuk ibu hamil", "bagi penderita diabetes": kondisi sebagai sasaran pemakaian tetap medis walau ada kata registrasi.
  new RegExp(`\\b(untuk|bagi|buat)\\b( ibu| orang| pasien)? (${KONDISI})\\b`),
  /\b(aman|boleh|bahaya|berbahaya)\b.*\b(diminum|dikonsumsi|dimakan|dipakai|digunakan|minum|konsumsi)\b/,
  /\b(dosis|takaran|aturan minum|efek samping|overdosis|interaksi obat|alergi|keracunan|diagnosis)\b/,
  /\bobat (apa|yang cocok|yang bagus|yang ampuh)\b/,
  /\b(saya|anak saya|ibu saya|bapak saya|suami saya|istri saya)\b.*\b(sakit|demam|batuk|pilek|pusing|mual|muntah|diare|gatal|ruam|sesak|nyeri)\b/,
];

// "Apakah ..." tentang kondisi tertentu juga medis, kecuali pertanyaan registrasi produk yang namanya memuat anak atau bayi.
const POLA_TANYA_KONDISI = new RegExp(`\\bapakah\\b.*\\b(${KONDISI})\\b`);

/** Ucapan berisi pertanyaan medis atau keamanan konsumsi yang harus diteruskan ke petugas. */
export const butuhPetugas = (ucapan) => {
  const s = sederhanakan(ucapan);
  // REQ-1.3: "Apakah Paracetamol Sirup Anak sudah terdaftar?" dicek di cekbpom; niat registrasi memakai pendeteksi jalur cek.
  return POLA_MEDIS.some((p) => p.test(s)) || (POLA_TANYA_KONDISI.test(s) && !kueriProduk(ucapan));
};

// "lapan" lazim diucapkan untuk delapan. Belasan dan puluhan ("tiga belas", "dua puluh satu") juga lazim saat menyebut nomor.
const ANGKA = { nol: '0', kosong: '0', satu: '1', dua: '2', tiga: '3', empat: '4', lima: '5', enam: '6', tujuh: '7', delapan: '8', lapan: '8', sembilan: '9' };
const ANGKA_GABUNG = { sepuluh: '10', sebelas: '11' };

/** Deretan digit yang terdengar dalam ucapan, dari angka maupun kata ("kosong delapan", "empat belas", "dua puluh satu"). */
export function digitDariUcapan(ucapan) {
  const kata = sederhanakan(ucapan).replace(/\bplus enam dua\b/g, '62').split(' ');
  let digit = '';
  for (let i = 0; i < kata.length; i++) {
    const k = kata[i];
    if (/^\d+$/.test(k)) digit += k;
    else if (ANGKA_GABUNG[k]) digit += ANGKA_GABUNG[k];
    else if (ANGKA[k] !== undefined) {
      const d = ANGKA[k];
      if (kata[i + 1] === 'belas' && d !== '0') { digit += `1${d}`; i++; }
      else if (kata[i + 1] === 'puluh' && d !== '0') {
        const satuan = ANGKA[kata[i + 2]];
        if (satuan !== undefined && satuan !== '0') { digit += d + satuan; i += 2; } else { digit += `${d}0`; i++; }
      } else digit += d;
    }
  }
  return digit.replace(/^62/, '0');
}

/**
 * Nomor telepon dari transkrip STT, berupa angka ("0812 3456 7890") atau kata ("nol delapan satu dua ...").
 * Format sama dengan entity penelepon di supabase/functions/_shared/entity/penelepon.ts: `08…`, 10–13 digit.
 */
export function nomorTeleponDariUcapan(ucapan) {
  const nomor = digitDariUcapan(ucapan);
  return /^08\d{8,11}$/.test(nomor) ? nomor : null;
}

/**
 * Alasan nomor yang terdengar tidak diterima, agar penelepon tahu apa yang salah: 'pendek', 'panjang', 'awalan',
 * atau null bila hampir tidak ada angka yang terdengar (cukup diminta ulang) atau nomornya sudah valid.
 */
export function masalahNomorTelepon(ucapan) {
  const d = digitDariUcapan(ucapan);
  if (d.length < 3 || /^08\d{8,11}$/.test(d)) return null;
  if (!d.startsWith('08')) return 'awalan';
  return d.length < 10 ? 'pendek' : 'panjang';
}

const ULANG_PER_ANGKA = 'Mohon sebutkan ulang nomor telepon Anda satu per satu angka, diawali nol delapan.';
/** Penjelasan nomor telepon yang ditolak, beserta kunci suara statisnya. Belum ada di kamus Lampiran A. */
export const PESAN_NOMOR_SALAH = Object.freeze({
  pendek: { pesan: `Nomor telepon yang terdengar kurang dari 10 angka. ${ULANG_PER_ANGKA}`, suara: 'telepon-pendek' },
  panjang: { pesan: `Nomor telepon yang terdengar lebih dari 13 angka. ${ULANG_PER_ANGKA}`, suara: 'telepon-panjang' },
  awalan: { pesan: 'Nomor telepon harus diawali nol delapan. Mohon sebutkan ulang nomor telepon Anda satu per satu angka.', suara: 'telepon-awalan' },
});

/** Pesan dan suara saat nomor telepon belum diterima: penjelasannya bila ada angka yang terdengar, selain itu pesan baku. */
export function mintaUlangTelepon(ucapan) {
  const masalah = masalahNomorTelepon(ucapan);
  return masalah ? PESAN_NOMOR_SALAH[masalah] : { pesan: PESAN_MINTA_ULANG_TELEPON, suara: 'ulang-telepon' };
}

/** Interface penerbit tiket. Implementasi tiruan dipakai selama Supabase belum tersedia (#30). */
export class PenerbitTiketTiruan {
  constructor(now = () => new Date()) {
    this.now = now;
    this.urutan = new Map();
  }

  async terbitkan({ nomorTelepon, pertanyaan }) {
    if (!nomorTelepon || !pertanyaan) throw new Error('data tiket tidak lengkap');
    const tanggal = this.now().toISOString().slice(0, 10).replaceAll('-', '');
    const n = (this.urutan.get(tanggal) ?? 0) + 1;
    this.urutan.set(tanggal, n);
    return `ESK-${tanggal}-${String(n).padStart(4, '0')}`;
  }
}

/** Implementasi lewat Edge Function `terbitkan-tiket-eskalasi` (supabase/README.md). Fungsi itu sendiri tidak diubah. */
export class PenerbitTiketSupabase {
  constructor(url, kunci) {
    this.url = url.replace(/\/$/, '');
    this.kunci = kunci;
  }

  async terbitkan({ percakapanId, nomorTelepon, pertanyaan }) {
    const r = await fetch(`${this.url}/functions/v1/terbitkan-tiket-eskalasi`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sigap-kunci': this.kunci },
      body: JSON.stringify({ percakapanId, nomorTelepon, pertanyaan }),
      signal: AbortSignal.timeout(15_000),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.data?.nomorTiket) throw new Error(`tiket ${r.status}`);
    return d.data.nomorTiket;
  }
}

/**
 * Batas penerbitan tiket agar gateway publik tidak dipakai membanjiri antrean petugas atau SMS ke nomor sembarang:
 * per panggilan, per IP per hari, dan per nomor telepon per hari. Mengembalikan jenis batas yang terlampaui, atau null.
 */
export class PembatasTiket {
  constructor({ perPanggilan = 2, perIpHarian = 5, perNomorHarian = 3 } = {}, now = () => Date.now()) {
    this.batas = { panggilan: perPanggilan, ip: perIpHarian, nomor: perNomorHarian };
    this.now = now;
    this.hari = '';
    this.hitungan = { panggilan: new Map(), ip: new Map(), nomor: new Map() };
  }

  gulir() {
    const hari = new Date(this.now()).toISOString().slice(0, 10);
    if (hari === this.hari) return;
    this.hari = hari;
    for (const m of Object.values(this.hitungan)) m.clear();
  }

  /** Memeriksa lalu langsung memesan kuota dalam satu langkah sinkron, agar giliran serentak tidak lolos bersamaan. */
  cadangkan(id, ip, nomor) {
    this.gulir();
    const kunci = { panggilan: id, ip, nomor };
    for (const jenis of ['panggilan', 'ip', 'nomor']) {
      if ((this.hitungan[jenis].get(kunci[jenis]) ?? 0) >= this.batas[jenis]) return jenis;
    }
    this.ubah(kunci, 1);
    return null;
  }

  /** Mengembalikan kuota yang dipesan bila penerbitan tiket gagal. */
  batalkan(id, ip, nomor) {
    this.ubah({ panggilan: id, ip, nomor }, -1);
  }

  ubah(kunci, n) {
    for (const jenis of ['panggilan', 'ip', 'nomor']) {
      const nilai = Math.max(0, (this.hitungan[jenis].get(kunci[jenis]) ?? 0) + n);
      this.hitungan[jenis].set(kunci[jenis], nilai);
    }
  }
}

// Deret nomor seluler (08…, +62 8…) berupa angka atau kata (termasuk "tiga belas", "dua puluh satu"), juga yang belum lengkap. Angka tepat setelah kode izin edar
// ("TR 083 245 461") atau yang menempel pada huruf, angka, atau tanda hubung (tiket ESK, tanggal 15-08-2026) tidak tersentuh.
// ponytail: tanggal berawalan 08 (08-06-2026) ikut tersamar; bedakan format tanggal bila mengganggu.
const POLA_DERET_TELEPON = new RegExp(
  `(?<![\\p{L}\\p{N}-]|\\b(?:${KODE_IZIN_EDAR})\\s?-?\\s?)(?:\\+?62\\s?|0)8[\\d\\s-]*\\d`
  + `|\\b(?:nol|kosong|plus enam dua)\\s+delapan(?:\\s+(?:${Object.keys(ANGKA).join('|')}|sepuluh|sebelas|belas|puluh))+\\b`,
  'giu',
);

/** NFR-13: deret nomor telepon dalam ucapan diganti "(nomor telepon)" sebelum masuk riwayat model atau ringkasan tiket ESK. */
export const samarkanDeretTelepon = (teks) => String(teks ?? '').replace(POLA_DERET_TELEPON, '(nomor telepon)');
