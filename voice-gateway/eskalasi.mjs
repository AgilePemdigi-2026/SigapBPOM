// Control UC-01 alur eskalasi (T-F1.4-03, REQ-1.7, NFR-6): pertanyaan medis atau keamanan konsumsi tidak dijawab AI,
// melainkan diteruskan ke petugas dengan tiket ESK. Seluruh alur memakai pesan baku tanpa memanggil AI.

/** Kamus pesan Lampiran A (UC-01 "Butuh petugas"). */
export const PESAN_BUTUH_PETUGAS = 'Pertanyaan Anda akan diteruskan kepada petugas. Mohon sebutkan nomor telepon Anda.';
/** Bagian kedua pesan "Butuh petugas", dipakai saat nomor tidak valid. Sama dengan pesan 422 Edge Function. */
export const PESAN_MINTA_ULANG_TELEPON = 'Mohon sebutkan nomor telepon Anda.';
/** Kamus pesan Lampiran A (UC-01 "Tiket eskalasi terbit"). */
export const pesanTiketEskalasi = (nomorTiket) => `Nomor tiket Anda ${nomorTiket}. Jawaban petugas akan dikirim melalui SMS.`;

const sederhanakan = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

// Nasihat medis, dosis, dan penilaian keamanan konsumsi untuk kondisi tertentu butuh penilaian petugas (NFR-6).
const POLA_MEDIS = [
  /\b(aman|bahaya|berbahaya|boleh|bisa|apakah)\b.*\b(hamil|menyusui|bayi|balita|anak|lansia|penderita|darah tinggi|diabetes|maag|asma|jantung|ginjal)\b/,
  /\b(aman|boleh|bahaya|berbahaya)\b.*\b(diminum|dikonsumsi|dimakan|dipakai|digunakan|minum|konsumsi)\b/,
  /\b(dosis|takaran|aturan minum|efek samping|overdosis|interaksi obat|alergi|keracunan|diagnosis)\b/,
  /\bobat (apa|yang cocok|yang bagus|yang ampuh)\b/,
  /\b(saya|anak saya|ibu saya|bapak saya|suami saya|istri saya)\b.*\b(sakit|demam|batuk|pilek|pusing|mual|muntah|diare|gatal|ruam|sesak|nyeri)\b/,
];

/** Ucapan berisi pertanyaan medis atau keamanan konsumsi yang harus diteruskan ke petugas. */
export const butuhPetugas = (ucapan) => POLA_MEDIS.some((p) => p.test(sederhanakan(ucapan)));

const ANGKA = { nol: '0', kosong: '0', satu: '1', dua: '2', tiga: '3', empat: '4', lima: '5', enam: '6', tujuh: '7', delapan: '8', sembilan: '9' };

/**
 * Nomor telepon dari transkrip STT, berupa angka ("0812 3456 7890") atau kata ("nol delapan satu dua ...").
 * Format sama dengan entity penelepon di supabase/functions/_shared/entity/penelepon.ts: `08…`, 10–13 digit.
 */
export function nomorTeleponDariUcapan(ucapan) {
  const kata = sederhanakan(ucapan).replace(/\bplus enam dua\b/g, '62').split(' ');
  const digit = kata.map((k) => ANGKA[k] ?? (/^\d+$/.test(k) ? k : '')).join('');
  const nomor = digit.replace(/^62/, '0');
  return /^08\d{8,11}$/.test(nomor) ? nomor : null;
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
