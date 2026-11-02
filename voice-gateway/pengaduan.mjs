// Control UC-02 Menyampaikan Pengaduan Produk di Voice Gateway (REQ-2.1, REQ-2.2, REQ-2.3, REQ-2.4, REQ-2.5, BR-1).
// Nama kelas mengikuti class diagram SRS. Tanpa I/O langsung: layanan eksternal lewat interface agar bisa diuji dengan `node --test`.
import { PESAN_MINTA_ULANG_TELEPON, nomorTeleponDariUcapan } from './eskalasi.mjs';

/** Nilai enum `jenis_interaksi` di basis data (supabase/migrations/20261020131737_inti_percakapan.sql). */
export const JENIS_INTERAKSI = Object.freeze({ INFORMASI_PRODUK: 'informasi_produk', PENGADUAN: 'pengaduan' });

/** Nomor menu: tekan 1 = informasi produk (UC-01), tekan 2 = pengaduan (UC-02). Kamus pesan Lampiran A. */
export const LAYANAN_INFORMASI_PRODUK = 1;
export const LAYANAN_PENGADUAN = 2;

/** Jenis interaksi percakapan untuk nomor menu yang dipilih, atau null bila tidak dikenal. */
export const jenisInteraksiDariMenu = (nomor) =>
  nomor === LAYANAN_INFORMASI_PRODUK ? JENIS_INTERAKSI.INFORMASI_PRODUK : nomor === LAYANAN_PENGADUAN ? JENIS_INTERAKSI.PENGADUAN : null;

/** Empat data wajib pengaduan (BR-1, REQ-2.2), dalam urutan ditanyakan. */
export const FIELD_PENGADUAN = Object.freeze(['namaProduk', 'kronologi', 'namaPelapor', 'nomorTelepon']);

/** Kamus pesan Lampiran A (UC-02 "Data kurang (contoh)"). Sama dengan pesan minta ulang nomor telepon di UC-01. */
export const PESAN_MINTA_NOMOR_TELEPON = PESAN_MINTA_ULANG_TELEPON;
// Tiga prompt berikut belum ada di kamus Lampiran A. Polanya mengikuti contoh "Data kurang" dan perlu ditambahkan ke kamus.
export const PESAN_MINTA_NAMA_PRODUK = 'Mohon sebutkan nama produk yang Anda adukan.';
export const PESAN_MINTA_KRONOLOGI = 'Mohon ceritakan kronologi kejadiannya.';
export const PESAN_MINTA_NAMA_PELAPOR = 'Mohon sebutkan nama Anda.';

/** Prompt tanya ulang per data yang kurang, dan kunci suara statis yang memutarnya lewat jalur TTS yang ada. */
export const PROMPT_DATA_KURANG = Object.freeze({
  namaProduk: { pesan: PESAN_MINTA_NAMA_PRODUK, suara: 'minta-nama-produk' },
  kronologi: { pesan: PESAN_MINTA_KRONOLOGI, suara: 'minta-kronologi' },
  namaPelapor: { pesan: PESAN_MINTA_NAMA_PELAPOR, suara: 'minta-nama' },
  nomorTelepon: { pesan: PESAN_MINTA_NOMOR_TELEPON, suara: 'ulang-telepon' },
});

const PANJANG_MAKS = { namaProduk: 200, kronologi: 4000, namaPelapor: 100 };
const KATA_MAKS = { namaProduk: 8, namaPelapor: 4 };
const KATA_MIN_KRONOLOGI = 3;
const SESI_PENGADUAN_MAKS = 500;

/** Nomor telepon Indonesia `08…` (10–13 digit), dari `08…`, `62…`, atau `+62…`. Aturan sama dengan entity penelepon. */
export function validasiNomorTelepon(masukan) {
  const nomor = String(masukan ?? '').replace(/[\s-]/g, '').replace(/^\+?62/, '0');
  return /^08\d{8,11}$/.test(nomor) ? nomor : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Ekstraksi data dari ucapan penelepon (T-F4.1-02, REQ-2.2).
// Interface ekstraktor: `ekstrak(ucapan, { ditanya, data }) -> { namaProduk?, kronologi?, namaPelapor?, nomorTelepon? }`.
// Implementasi bawaan berbasis aturan, tanpa memanggil AI: hemat kuota GPT dan data pribadi tidak keluar dari gateway.
// ---------------------------------------------------------------------------------------------------------------------

const ANGKA_KATA = 'nol|kosong|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan';
const POLA_NOMOR_ANGKA = /(?:\+?62|0)\s*8[\d\s-]{7,16}\d/;
const POLA_NOMOR_KATA = new RegExp(`\\b(?:(?:${ANGKA_KATA}|plus)\\s+){4,}(?:${ANGKA_KATA})\\b`, 'giu');
const POLA_PENGANTAR_NOMOR = /\b(?:nomor|no)\.?\s*(?:telepon|telpon|hp|handphone|wa|whatsapp|ponsel|kontak)?\s*(?:saya|anda|nya)?\s*(?:adalah|yaitu)?\s*$/iu;
const FILLER = new Set(['iya', 'ya', 'oke', 'ok', 'baik', 'halo', 'hmm', 'eh', 'em', 'tidak', 'nggak', 'gak', 'enggak', 'belum', 'sudah', 'apa', 'maaf', 'terima', 'kasih']);
const KATA_HENTI_NAMA = new Set([
  'dan', 'nomor', 'no', 'telepon', 'telpon', 'hp', 'produk', 'yang', 'saya', 'membeli', 'beli', 'mengalami', 'dari', 'untuk', 'ya', 'adalah',
  'tinggal', 'di', 'kronologi', 'kejadian', 'setelah', 'sesudah', 'lalu', 'kemudian', 'karena', 'tapi', 'tetapi', 'dengan', 'nama', 'itu', 'ingin', 'mau',
]);
const POLA_BATAS_PRODUK = /\s+(?:di|dari|pada|kemarin|tadi|lalu|setelah|sesudah|ketika|saat|waktu|karena|sehingga|tapi|tetapi|dan|kronologi|kronologinya|kejadiannya|nama|nomor|atas|yang|untuk|buat|dengan|sebanyak|seharga|sekitar|itu)\b/iu;
const POLA_PRODUK = [
  /\bnama\s+produk(?:nya)?\s*(?:adalah|yaitu|:)?\s+(.+)/isu,
  /\bproduk(?:nya)?\s+(?:yang\s+(?:saya\s+)?(?:adukan|laporkan)\s+)?(?:bernama|adalah|yaitu)\s+(.+)/isu,
  /\b(?:mengadukan|melaporkan|membeli|beli|mengonsumsi|meminum|memakai|menggunakan)\s+(?:produk\s+)?(.+)/isu,
];
const POLA_NAMA = /\b(?:nama\s+(?:saya|pelapor|lengkap(?:\s+saya)?)|atas\s+nama|saya\s+bernama|perkenalkan,?\s+saya)\s*(?:adalah\s+)?(\p{L}[\p{L}'.-]*(?:\s+\p{L}[\p{L}'.-]*){0,3})/iu;
const POLA_KRONOLOGI_EKSPLISIT = /\b(?:kronologi(?:nya)?|kejadiannya|ceritanya)\s*(?:kejadian)?\s*(?:adalah|begini|yaitu|:)?\s+(.+)/isu;
const POLA_KRONOLOGI_PENANDA = /\b(?:setelah|sesudah|usai|ketika|saat|sewaktu|kemudian|ternyata|mengalami|merasa)\b.*/isu;
const POLA_AKHIR_KRONOLOGI = /\b(?:nama\s+(?:saya|pelapor)|atas\s+nama|nomor\s+(?:telepon|telpon|hp|wa|saya)|no\.?\s*(?:telepon|hp))\b.*/isu;

const hitungKata = (s) => s.split(/\s+/).filter(Boolean).length;
const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, '');
const adalahFiller = (s) => hitungKata(s) <= 2 && s.toLowerCase().split(/\s+/).every((k) => FILLER.has(k.replace(/[^\p{L}]/gu, '')));

/** Nomor telepon valid dari ucapan (angka atau kata), beserta sisa ucapan tanpa nomor itu. */
function cariNomor(ucapan) {
  const cocok = ucapan.match(POLA_NOMOR_ANGKA);
  const dariAngka = cocok ? validasiNomorTelepon(cocok[0]) : null;
  if (dariAngka) return { nomor: dariAngka, sisa: ucapan.replace(cocok[0], ' ').replace(POLA_PENGANTAR_NOMOR, ' ') };
  const dariKata = nomorTeleponDariUcapan(ucapan);
  if (dariKata) return { nomor: dariKata, sisa: ucapan.replace(POLA_NOMOR_KATA, ' ').replace(POLA_PENGANTAR_NOMOR, ' ') };
  return { nomor: null, sisa: ucapan };
}

function cariNamaProduk(teks) {
  for (const pola of POLA_PRODUK) {
    const cocok = teks.match(pola);
    if (!cocok) continue;
    const awal = cocok[1].split(/[,.;!?]/)[0];
    const [bagian] = awal.split(POLA_BATAS_PRODUK);
    const nama = rapikan(bagian).split(' ').slice(0, KATA_MAKS.namaProduk).join(' ');
    if (nama && !adalahFiller(nama) && !KATA_HENTI_NAMA.has(nama.toLowerCase())) return nama.slice(0, PANJANG_MAKS.namaProduk);
  }
  return null;
}

function potongNama(kata) {
  const hasil = [];
  for (const k of kata.split(/\s+/)) {
    if (KATA_HENTI_NAMA.has(k.toLowerCase())) break;
    hasil.push(k);
  }
  return hasil.join(' ');
}

function cariNamaPelapor(teks) {
  const cocok = teks.match(POLA_NAMA);
  if (!cocok) return null;
  const nama = rapikan(potongNama(cocok[1]));
  return nama && !adalahFiller(nama) ? nama.slice(0, PANJANG_MAKS.namaPelapor) : null;
}

function cariKronologi(teks, ditanya) {
  const eksplisit = teks.match(POLA_KRONOLOGI_EKSPLISIT);
  // Saat kronologi yang ditanyakan ulang, kalimat sebelum penanda ikut menjadi bagian ceritanya.
  const cocok = eksplisit ?? (ditanya === 'kronologi' ? [teks] : teks.match(POLA_KRONOLOGI_PENANDA));
  if (!cocok) return null;
  const isi = rapikan((cocok[1] ?? cocok[0]).replace(POLA_AKHIR_KRONOLOGI, ''));
  return hitungKata(isi) >= KATA_MIN_KRONOLOGI ? isi.slice(0, PANJANG_MAKS.kronologi) : null;
}

/** Jawaban atas satu pertanyaan tanya ulang tanpa kata pengantar, mis. "Nama saya Budi" atau cukup "Budi". */
function jawabanLangsung(ditanya, teks) {
  const bersih = rapikan(teks);
  if (!bersih) return null;
  if (ditanya === 'kronologi') return hitungKata(bersih) >= KATA_MIN_KRONOLOGI ? bersih.slice(0, PANJANG_MAKS.kronologi) : null;
  if (ditanya === 'namaProduk') {
    const nama = rapikan(bersih.replace(/^(?:ya\s+)?(?:nama\s+)?produk(?:nya)?\s*(?:adalah|itu|yaitu)?\s+/iu, ''));
    return nama && !adalahFiller(nama) && hitungKata(nama) <= KATA_MAKS.namaProduk ? nama.slice(0, PANJANG_MAKS.namaProduk) : null;
  }
  if (ditanya === 'namaPelapor') {
    const nama = rapikan(bersih.replace(/^(?:ya\s+)?(?:nama(?:nya)?\s*(?:saya|pelapor)?|saya|atas\s+nama)\s*(?:adalah)?\s*/iu, ''));
    return nama && !adalahFiller(nama) && hitungKata(nama) <= KATA_MAKS.namaPelapor && /^[\p{L}'. -]+$/u.test(nama) && potongNama(nama) === nama
      ? nama.slice(0, PANJANG_MAKS.namaPelapor)
      : null;
  }
  return null;
}

/** Ekstraktor berbasis aturan: pola kalimat lazim untuk tiap data, lalu jawaban langsung untuk data yang baru ditanyakan. */
export class EkstraktorAturan {
  ekstrak(ucapan, { ditanya = null, data = {} } = {}) {
    const asli = String(ucapan ?? '').replace(/\s+/g, ' ').trim();
    const { nomor, sisa } = cariNomor(asli);
    const hasil = {};
    if (nomor) hasil.nomorTelepon = nomor;
    const namaPelapor = cariNamaPelapor(sisa);
    if (namaPelapor) hasil.namaPelapor = namaPelapor;
    const namaProduk = cariNamaProduk(sisa);
    if (namaProduk) hasil.namaProduk = namaProduk;
    const kronologi = cariKronologi(sisa, ditanya);
    if (kronologi) hasil.kronologi = kronologi;
    // Pertanyaan tanya ulang dijawab apa adanya, tetapi hanya bila ucapan tidak memuat data lain yang sudah dikenali.
    if (ditanya && ditanya !== 'nomorTelepon' && data[ditanya] === undefined && !(ditanya in hasil) && Object.keys(hasil).length === 0) {
      const langsung = jawabanLangsung(ditanya, sisa);
      if (langsung) hasil[ditanya] = langsung;
    }
    return hasil;
  }
}

export class PengaduanController {
  constructor({ ekstraktor = new EkstraktorAturan() } = {}) {
    this.ekstraktor = ekstraktor;
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

  /**
   * REQ-2.2: serap data dari ucapan penelepon, lalu tanyakan hanya data yang masih kurang, satu per giliran.
   * Mengembalikan `{ lengkap: false, kurang, jawaban, suara }`, atau `{ lengkap: true, data }` bila keempat data sudah ada.
   */
  async tangani(id, ucapan) {
    const s = this.sesi.get(id);
    if (!s) throw new Error('pengaduan belum dimulai');
    const diperoleh = await this.ekstraktor.ekstrak(ucapan, { ditanya: s.ditanya, data: { ...s.data } });
    for (const f of FIELD_PENGADUAN) {
      if (s.data[f] !== undefined || diperoleh?.[f] === undefined) continue;
      const nilai = f === 'nomorTelepon' ? validasiNomorTelepon(diperoleh[f]) : String(diperoleh[f]).trim();
      if (nilai) s.data[f] = nilai;
    }
    const kurang = FIELD_PENGADUAN.filter((f) => s.data[f] === undefined);
    if (kurang.length === 0) {
      s.ditanya = null;
      return { lengkap: true, data: { ...s.data } };
    }
    s.ditanya = kurang[0];
    return { lengkap: false, kurang, jawaban: PROMPT_DATA_KURANG[s.ditanya].pesan, suara: PROMPT_DATA_KURANG[s.ditanya].suara };
  }
}
