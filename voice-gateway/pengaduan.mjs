// Control UC-02 Menyampaikan Pengaduan Produk di Voice Gateway (REQ-2.1, REQ-2.2, REQ-2.3, REQ-2.4, REQ-2.5, BR-1).
// Nama kelas mengikuti class diagram SRS. Tanpa I/O langsung: layanan eksternal lewat interface agar bisa diuji dengan `node --test`.
import { PESAN_MINTA_ULANG_TELEPON, PESAN_NOMOR_SALAH, masalahNomorTelepon, nomorTeleponDariUcapan } from './eskalasi.mjs';

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
// Kamus pesan Lampiran A (UC-02 "Data kurang: nama produk", "Data kurang: kronologi", "Data kurang: nama pelapor").
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

const LABEL_DATA = { namaProduk: 'nama produk', kronologi: 'kronologi kejadian', namaPelapor: 'nama', nomorTelepon: 'nomor telepon' };
const KODE_DATA = { namaProduk: 'produk', kronologi: 'kronologi', namaPelapor: 'nama', nomorTelepon: 'telepon' };
const gabungDaftar = (l) => (l.length <= 2 ? l.join(' dan ') : `${l.slice(0, -1).join(', ')}, dan ${l.at(-1)}`);

/**
 * Prompt untuk data yang masih kurang (urutan FIELD_PENGADUAN). Satu data memakai prompt tunggalnya; dua data atau lebih
 * ditanyakan bersamaan agar penelepon bisa menjawab sekaligus, bukan ditanya satu per satu. Belum ada di kamus Lampiran A.
 */
export function promptDataKurang(kurang) {
  if (kurang.length === 1) return PROMPT_DATA_KURANG[kurang[0]];
  return {
    pesan: `Mohon sebutkan ${gabungDaftar(kurang.map((f) => LABEL_DATA[f]))} Anda. Boleh disebutkan sekaligus.`,
    suara: `kurang-${kurang.map((f) => KODE_DATA[f]).join('-')}`,
  };
}

/**
 * Suara statis tambahan alur pengaduan (kunci -> teks): setiap gabungan dua data kurang atau lebih, dan penjelasan nomor
 * telepon yang ditolak. Gabungan data kurang dirender saat pertama dipakai, bukan saat gateway menyala, agar hemat kuota TTS.
 */
export const SUARA_PENGADUAN = Object.freeze(Object.fromEntries([
  ...Array.from({ length: 2 ** FIELD_PENGADUAN.length }, (_, m) => FIELD_PENGADUAN.filter((_, i) => m & (1 << i)))
    .filter((k) => k.length >= 2)
    .map((k) => [promptDataKurang(k).suara, promptDataKurang(k).pesan]),
  ...Object.values(PESAN_NOMOR_SALAH).map(({ suara, pesan }) => [suara, pesan]),
]));

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
// Interface ekstraktor: `ekstrak(ucapan, { ditanya, kurang, data }) -> { namaProduk?, kronologi?, namaPelapor?, nomorTelepon? }`.
// Implementasi bawaan berbasis aturan, tanpa memanggil AI: hemat kuota GPT dan data pribadi tidak keluar dari gateway.
// ---------------------------------------------------------------------------------------------------------------------

const ANGKA_KATA = 'nol|kosong|satu|dua|tiga|empat|lima|enam|tujuh|delapan|lapan|sembilan|sepuluh|sebelas|belas|puluh';
const POLA_NOMOR_ANGKA = /(?:\+?62|0)\s*8[\d\s-]{7,16}\d/;
const POLA_NOMOR_KATA = new RegExp(`\\b(?:(?:${ANGKA_KATA}|plus)\\s+){4,}(?:${ANGKA_KATA})\\b`, 'giu');
const POLA_KATA_NOMOR = /\b(?:nomor|no|telepon|telpon|hp|handphone|wa|whatsapp|ponsel)\b/iu;
// Deret angka yang mirip nomor telepon (enam angka atau lebih, ditulis atau diucapkan), walau tanpa kata "nomor".
const POLA_DERET_ANGKA = new RegExp(`(?:\\b(?:${ANGKA_KATA})\\b[\\s,.-]*){6,}|\\d(?:[\\s-]?\\d){5,}`, 'iu');
const POLA_PENGANTAR_NOMOR = /\b(?:nomor|no)\.?\s*(?:telepon|telpon|hp|handphone|wa|whatsapp|ponsel|kontak)?\s*(?:saya|anda|nya)?\s*(?:adalah|yaitu)?\s*$/iu;
const FILLER = new Set(['iya', 'ya', 'oke', 'ok', 'baik', 'halo', 'hmm', 'eh', 'em', 'tidak', 'nggak', 'gak', 'enggak', 'belum', 'sudah', 'apa', 'maaf', 'terima', 'kasih']);
const KATA_HENTI_NAMA = new Set([
  'dan', 'nomor', 'nomer', 'no', 'telepon', 'telpon', 'telp', 'hp', 'produk', 'yang', 'saya', 'membeli', 'beli', 'mengalami', 'dari', 'untuk', 'ya', 'adalah',
  'tinggal', 'di', 'kronologi', 'kejadian', 'setelah', 'sesudah', 'lalu', 'kemudian', 'karena', 'tapi', 'tetapi', 'dengan', 'nama', 'itu', 'ingin', 'mau',
]);
const KATA_AKIBAT = 'membuat|menyebabkan|mengakibatkan|bikin';
const POLA_BATAS_PRODUK = new RegExp(`(?:^|\\s+)(?:di|dari|pada|kemarin|tadi|lalu|setelah|sesudah|ketika|saat|waktu|karena|sehingga|tapi|tetapi|dan|kronologi|kronologinya|kejadiannya|nama|nomor|atas|yang|untuk|buat|dengan|sebanyak|seharga|sekitar|itu|${KATA_AKIBAT})\\b`, 'iu');
// Kalimat yang diawali nama produk lalu akibatnya, seperti contoh SRS Tabel B.3 "Krim Wajah Glowing membuat kulit saya iritasi ...".
const POLA_KALIMAT_AKIBAT = new RegExp(`(?<=^|[.!?,;])\\s*([^.!?,;]+?)\\s+(?:${KATA_AKIBAT})\\s`, 'giu');
const KATA_BUKAN_PRODUK = new Set([...KATA_HENTI_NAMA, ...FILLER, 'ini', 'tersebut', 'ternyata', 'aku', 'kami', 'kita', 'dia', 'ia', 'mereka']);
const POLA_PRODUK = [
  /\bnama\s+produk(?:nya)?\s*(?:adalah|yaitu|:)?\s+(.+)/isu,
  /\bproduk(?:nya)?\s+(?:yang\s+(?:saya\s+)?(?:adukan|laporkan)\s+)?(?:bernama|adalah|yaitu)\s+(.+)/isu,
  /\b(?:mengadukan|melaporkan|membeli|beli|mengonsumsi|meminum|memakai|menggunakan)\s+(?:produk\s+)?(.+)/isu,
];
// Pengantar nama pelapor: "nama saya X", juga bentuk singkat "nama X" / "namanya X" / "nama aku X". "Nama produk",
// "nama toko", dan sejenisnya bukan nama pelapor.
const PENGANTAR_NAMA = String.raw`nama(?:nya)?(?!\s+(?:produk|toko|merek|merk|barang|obat|apotek|warung|minimarket))(?:\s+(?:saya|aku|gue|gua|gw|pelapor|lengkap(?:\s+saya)?))?(?=\s)|atas\s+nama|(?<!\b(?:anak|istri|suami|ibu|ayah|bapak|adik|kakak|teman)\s+)saya\s+bernama|perkenalkan,?\s+saya`;
const POLA_NAMA = new RegExp(String.raw`\b(?:${PENGANTAR_NAMA})\s*(?:adalah\s+|:\s*)?(\p{L}[\p{L}'.-]*(?:\s+\p{L}[\p{L}'.-]*){0,3})`, 'iu');
const POLA_KRONOLOGI_EKSPLISIT = /\b(?:kronologi(?:nya)?|kejadiannya|ceritanya)\s*(?:kejadian)?\s*(?:adalah|begini|yaitu|:)?\s+(.+)/isu;
const POLA_KRONOLOGI_PENANDA = /\b(?:setelah|sesudah|usai|ketika|saat|sewaktu|kemudian|ternyata|mengalami|merasa)\b.*/isu;
// Kronologi berhenti di pengantar nama pelapor atau nomor telepon, termasuk ejaan lisan "nomer" dan "telp".
const POLA_AKHIR_KRONOLOGI = new RegExp(String.raw`\b(?:${PENGANTAR_NAMA}|(?:nomor|nomer)\s+(?:telepon|telpon|telp|hp|wa|saya|aku)|no\.?\s*(?:telepon|telpon|telp|hp|wa))\b.*`, 'isu');

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

/**
 * Kalimat akibat pertama yang subjeknya layak sebagai nama produk, atau yang memuat `produk` yang sudah dikenali
 * ("Saya membeli X yang membuat ..."): `{ namaProduk, kalimat, index }`, atau null.
 * ponytail: subjek tanpa kata ganti atau kata sambung dianggap nama produk, jadi kata benda umum seperti "Pemakaian rutin"
 * ikut tertangkap. Bila sering terjadi, tambahkan daftar kata benda umum atau pasang ekstraktor lain lewat interface.
 */
function cariKalimatAkibat(teks, produk) {
  for (const m of teks.matchAll(POLA_KALIMAT_AKIBAT)) {
    // Anak kalimat "yang saya beli" dibuang; subjek lain yang memuat kata ganti atau kata sambung bukan nama produk.
    const nama = rapikan(m[1].split(/\s+yang(?:\s|$)/iu)[0]);
    const kata = nama.toLowerCase().split(' ').map((k) => k.replace(/[^\p{L}]/gu, ''));
    const layak = nama && kata.length <= KATA_MAKS.namaProduk && !kata.some((k) => KATA_BUKAN_PRODUK.has(k));
    if (layak || (produk && m[1].includes(produk))) {
      return { namaProduk: layak ? nama.slice(0, PANJANG_MAKS.namaProduk) : produk, kalimat: teks.slice(m.index), index: m.index };
    }
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

function cariKronologi(teks, ditanya, akibat) {
  const eksplisit = teks.match(POLA_KRONOLOGI_EKSPLISIT);
  const penanda = teks.match(POLA_KRONOLOGI_PENANDA);
  // Kalimat akibat diambil utuh dari subjeknya, kecuali kata penanda muncul lebih dulu, agar keluhannya tidak terpotong.
  const umum = akibat && !(penanda && penanda.index < akibat.index) ? [akibat.kalimat] : penanda;
  // Saat kronologi yang ditanyakan ulang, kalimat sebelum penanda ikut menjadi bagian ceritanya.
  const cocok = eksplisit ?? (ditanya === 'kronologi' ? [teks] : umum);
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

// Kata yang tidak membawa isi data: kata pengantar ("nama saya", "kronologinya"), kata ganti, dan kata seru percakapan.
const KATA_PENGANTAR = new Set([
  ...KATA_BUKAN_PRODUK, 'atas', 'bernama', 'perkenalkan', 'lengkap', 'pelapor', 'namanya', 'produknya', 'kronologinya', 'kejadiannya', 'ceritanya',
  'yaitu', 'begini', 'lu', 'lo', 'gue', 'gua', 'kenapa', 'gimana', 'bagaimana', 'kok', 'sih', 'dong', 'deh', 'nih', 'tuh', 'loh', 'lah',
  'kemarin', 'tadi', 'barusan', 'sekarang', 'pagi', 'siang', 'sore', 'malam', 'hari', 'minggu', 'bulan', 'tahun', 'waktu', 'pada', 'sejak',
]);
const kataBersih = (s) => s.toLowerCase().split(' ').map((k) => k.replace(/[^\p{L}]/gu, '')).filter(Boolean);

/** Satu potongan kalimat tanpa kata pengantar, bila bentuknya cocok untuk data `f`: nama produk, kronologi, atau nama pelapor. */
function isiPotongan(f, potongan) {
  const kata = kataBersih(potongan);
  const isi = kata.filter((k) => !KATA_PENGANTAR.has(k));
  if (f === 'namaProduk') return isi.length === kata.length && kata.length <= KATA_MAKS.namaProduk ? potongan.slice(0, PANJANG_MAKS.namaProduk) : null;
  if (f === 'namaPelapor') {
    return isi.length === kata.length && kata.length <= KATA_MAKS.namaPelapor && /^[\p{L}'. -]+$/u.test(potongan) ? potongan.slice(0, PANJANG_MAKS.namaPelapor) : null;
  }
  if (f === 'kronologi') return hitungKata(potongan) >= KATA_MIN_KRONOLOGI && isi.length >= 2 ? potongan.slice(0, PANJANG_MAKS.kronologi) : null;
  return null;
}

/**
 * Ekstraktor berbasis aturan: pola kalimat lazim untuk tiap data, lalu jawaban langsung untuk data yang baru ditanyakan.
 * Bila `kurang` diberikan (data yang sedang ditanyakan bersamaan), potongan kalimat yang belum dikenali pola mana pun
 * ("Susu Greenfield, kulit saya gatal, Abin") dipasangkan ke data yang kurang menurut urutan pertanyaan.
 * ponytail: pemasangan menurut urutan, jadi "Abin, Susu Greenfield" tertukar bila nama produk dan nama sama-sama kurang.
 */
export class EkstraktorAturan {
  ekstrak(ucapan, { ditanya = null, kurang = null, data = {} } = {}) {
    const asli = String(ucapan ?? '').replace(/\s+/g, ' ').trim();
    const { nomor, sisa } = cariNomor(asli);
    const hasil = {};
    if (nomor) hasil.nomorTelepon = nomor;
    const namaPelapor = cariNamaPelapor(sisa);
    if (namaPelapor) hasil.namaPelapor = namaPelapor;
    const produk = cariNamaProduk(sisa);
    const akibat = cariKalimatAkibat(sisa, produk);
    const namaProduk = produk ?? akibat?.namaProduk;
    if (namaProduk) hasil.namaProduk = namaProduk;
    // Data teks yang masih ditunggu, yang ditanyakan lebih dulu di depan. Nomor telepon hanya dari pola nomor.
    const belum = (kurang ?? (ditanya ? [ditanya] : [])).filter((f) => f !== 'nomorTelepon' && data[f] === undefined);
    const urutan = belum.includes(ditanya) ? [ditanya, ...belum.filter((f) => f !== ditanya)] : belum;
    // Kronologi yang ditanyakan sendirian boleh diambil seluruh ucapan; bila ditanyakan bersama data lain, potongan yang menentukan.
    const kronologi = cariKronologi(sisa, urutan.length <= 1 ? ditanya : null, akibat);
    if (kronologi) hasil.kronologi = kronologi;
    // Pertanyaan tanya ulang dijawab apa adanya, tetapi hanya bila ucapan tidak memuat data lain yang sudah dikenali.
    if (urutan.length <= 1 && ditanya && ditanya !== 'nomorTelepon' && data[ditanya] === undefined && !(ditanya in hasil) && Object.keys(hasil).length === 0) {
      const langsung = jawabanLangsung(ditanya, sisa);
      if (langsung) hasil[ditanya] = langsung;
    }
    if (!kurang) return hasil;
    // Sisa ucapan setelah data yang sudah dikenali dibuang, dipotong per tanda baca.
    let sisaIsi = sisa;
    // Nama produk biasanya di tengah anak kalimat ("membeli X kemarin"), jadi dibuang tanpa memotong kalimatnya.
    if (hasil.namaProduk) sisaIsi = sisaIsi.replace(hasil.namaProduk, ' ');
    for (const v of [hasil.namaPelapor, hasil.kronologi]) if (v) sisaIsi = sisaIsi.replace(v, ' , ');
    const potongan = sisaIsi.split(/[,.;!?]+/).map(rapikan).filter((p) => kataBersih(p).some((k) => !KATA_PENGANTAR.has(k)));
    for (const p of potongan) {
      const f = urutan.find((g) => !(g in hasil) && isiPotongan(g, p));
      if (f) hasil[f] = isiPotongan(f, p);
    }
    return hasil;
  }
}

/** Kamus pesan Lampiran A (UC-02 "Tiket pengaduan terbit"). Juga isi SMS tindak lanjut (REQ-2.4). */
export const pesanTiketPengaduan = (nomorTiket) => `Pengaduan Anda telah dicatat dengan nomor tiket ${nomorTiket}. Tindak lanjut akan dikirim melalui SMS.`;

/** Kamus pesan Lampiran A (UC-02 "Panggilan putus, data kurang"). */
export const PESAN_PENGADUAN_TIDAK_LENGKAP = 'Panggilan berakhir. Pengaduan belum lengkap sehingga nomor tiket tidak diterbitkan.';

/**
 * Kamus pesan Lampiran A (UC-01, UC-02 "Batas percakapan satu panggilan tercapai"), sama dengan `PESAN_BATAS_AI.panggilan`
 * di percakapan.mjs (tidak diimpor karena percakapan.mjs mengimpor modul ini). Satu percakapan hanya punya satu tiket
 * pengaduan (tiket.percakapan_id unik), jadi pengaduan berikutnya perlu panggilan baru.
 */
export const PESAN_BATAS_PERCAKAPAN = 'Batas percakapan untuk panggilan ini sudah tercapai. Silakan akhiri dan mulai panggilan baru.';

/** Server menolak percakapan ini (409): sudah ada dengan jenis atau status yang tidak boleh diubah. Dianggap tidak tersimpan. */
export class PercakapanDitolak extends Error {
  constructor() { super('percakapan ditolak'); }
}

/** Batas penerbitan tiket tercapai. Dilempar ke boundary yang memetakannya menjadi 429. */
export class BatasTiketTercapai extends Error {
  constructor(jenis) {
    super('batas tiket');
    this.jenis = jenis;
  }
}

/**
 * Control UC-02 di Voice Gateway. Gerbang (Edge Function) dan pengirim SMS dipasang lewat interface:
 * `gerbang.terbitkanTiket(data) -> nomorTiket`, `gerbang.simpanTidakLengkap(data) -> void`, `pengirimSms.kirim(nomor, teks)`.
 * Seluruh alur tanpa AI: data pelapor tidak pernah masuk riwayat atau prompt model.
 */
export class PengaduanController {
  constructor({ ekstraktor = new EkstraktorAturan(), gerbang = null, pengirimSms = null, pembatas = null } = {}) {
    this.ekstraktor = ekstraktor;
    this.gerbang = gerbang;
    this.pengirimSms = pengirimSms;
    this.pembatas = pembatas;
    // Status pengumpulan data per panggilan. Hanya ada selama pengaduan berjalan.
    this.sesi = new Map();
  }

  /** Penelepon menekan 2: mulai pengumpulan data pengaduan pada panggilan ini. */
  mulai(id) {
    // Tiket percakapan ini sudah terbit: penerbitan berikutnya hanya mengembalikan nomor lama tanpa mencatat data baru,
    // jadi pengaduan kedua tidak dikumpulkan. Ucapannya tetap ditangani di sini (`ulang`) agar tidak sampai ke AI.
    const ada = this.sesi.get(id);
    if (ada?.tiket) {
      ada.ulang = true;
      return;
    }
    this.sesi.delete(id);
    if (this.sesi.size >= SESI_PENGADUAN_MAKS) {
      // Geser dulu sesi yang sudah bertiket; pengaduan berjalan hanya tergeser bila semuanya masih berjalan.
      const korban = [...this.sesi].find(([, v]) => v.tiket !== null)?.[0] ?? this.sesi.keys().next().value;
      this.sesi.delete(korban);
    }
    this.sesi.set(id, { data: {}, ditanya: null, tiket: null, janji: null, ulang: false });
  }

  /** Penelepon kembali ke menu atau memilih layanan lain: alur pengaduan dibuang. Tiket yang sudah terbit tetap diingat. */
  batal(id) {
    const s = this.sesi.get(id);
    if (s?.tiket) s.ulang = false;
    else this.sesi.delete(id);
  }

  /** Nama dan nomor telepon pelapor yang sudah terkumpul, untuk disamarkan dari bahan ringkasan (REQ-5.2, NFR-13). */
  dataPribadi(id) {
    const d = this.sesi.get(id)?.data ?? {};
    return [d.namaPelapor, d.nomorTelepon].filter(Boolean);
  }

  /** Panggilan sedang dalam alur pengaduan yang belum selesai, atau masih di layanan 2 setelah tiketnya terbit. */
  aktif(id) {
    const s = this.sesi.get(id);
    return Boolean(s) && (s.tiket === null || s.ulang);
  }

  /**
   * REQ-2.2, REQ-2.3: serap data dari ucapan, tanyakan hanya data yang kurang, dan begitu lengkap terbitkan tiket (BR-1).
   * Mengembalikan `{ lengkap: false, kurang, jawaban, suara }`, `{ lengkap: true, tiket, jawaban }`, atau
   * `{ lengkap: false, sudahBertiket: true, jawaban }` bila tiket percakapan ini sudah terbit.
   * Bila penerbitan gagal, data tetap tersimpan sehingga giliran berikutnya mengulang penerbitan; Edge Function
   * mengembalikan nomor yang sama untuk percakapan yang sama, jadi retry tidak membuat tiket ganda.
   */
  async tangani(id, ucapan, { ip = '' } = {}) {
    const s = this.sesi.get(id);
    if (!s) throw new Error('pengaduan belum dimulai');
    const kurangSebelum = FIELD_PENGADUAN.filter((f) => s.data[f] === undefined);
    const diperoleh = await this.ekstraktor.ekstrak(ucapan, { ditanya: s.ditanya, kurang: kurangSebelum, data: { ...s.data } });
    // Ucapan setelah tiket terbit (juga giliran serentak yang tiketnya terbit selama ekstraksi) tidak dicatat di mana pun,
    // jadi tidak boleh dijawab seolah pengaduannya tercatat.
    if (s.tiket !== null) return { lengkap: false, sudahBertiket: true, jawaban: PESAN_BATAS_PERCAKAPAN };
    for (const f of FIELD_PENGADUAN) {
      if (s.data[f] !== undefined || diperoleh?.[f] === undefined) continue;
      const nilai = f === 'nomorTelepon' ? validasiNomorTelepon(diperoleh[f]) : String(diperoleh[f]).trim();
      if (nilai) s.data[f] = nilai;
    }
    const kurang = FIELD_PENGADUAN.filter((f) => s.data[f] === undefined);
    if (kurang.length > 0) {
      // Penelepon sudah mencoba menyebut nomor tetapi ditolak: jelaskan salahnya (kurang angka, kelebihan, bukan 08) dulu.
      const cobaNomor = kurang.includes('nomorTelepon') && (s.ditanya === 'nomorTelepon' || POLA_KATA_NOMOR.test(ucapan) || POLA_DERET_ANGKA.test(ucapan));
      const masalah = cobaNomor ? masalahNomorTelepon(ucapan) : null;
      s.ditanya = masalah ? 'nomorTelepon' : kurang[0];
      const prompt = masalah ? PESAN_NOMOR_SALAH[masalah] : promptDataKurang(kurang);
      return { lengkap: false, kurang, jawaban: prompt.pesan, suara: prompt.suara, ...(masalah && { masalahNomor: masalah }) };
    }
    s.ditanya = null;
    if (!this.gerbang) return { lengkap: true, data: { ...s.data } };
    s.janji ??= this.terbitkan(id, s, ip).finally(() => { s.janji = null; });
    const nomorTiket = await s.janji;
    return { lengkap: true, tiket: nomorTiket, jawaban: pesanTiketPengaduan(nomorTiket) };
  }

  async terbitkan(id, s, ip) {
    const nomorTelepon = s.data.nomorTelepon;
    const batas = this.pembatas?.cadangkan(id, ip, nomorTelepon);
    if (batas) throw new BatasTiketTercapai(batas);
    let nomorTiket;
    try {
      nomorTiket = await this.gerbang.terbitkanTiket({ percakapanId: id, ...s.data });
    } catch (e) {
      this.pembatas?.batalkan(id, ip, nomorTelepon);
      // Ditolak server: mengulang tidak akan pernah berhasil, jadi alur pengaduan ini dihentikan.
      if (e instanceof PercakapanDitolak) this.sesi.delete(id);
      throw e;
    }
    s.tiket = nomorTiket;
    // Penelepon masih di layanan 2: pengaduan berikutnya tetap dijawab control ini, bukan AI yang akan menanyakan data
    // pelapor lalu menjanjikan penerusan pengaduan yang tidak pernah tercatat. `batal()` mengembalikannya ke alur UC-01.
    s.ulang = true;
    // REQ-2.4: SMS lewat adapter. Kegagalan SMS tidak membatalkan tiket yang sudah terbit.
    try { await this.pengirimSms?.kirim(nomorTelepon, pesanTiketPengaduan(nomorTiket)); } catch { /* tiket tetap sah */ }
    // Data pelapor tidak perlu disimpan lagi di memori gateway setelah tiket terbit.
    s.data = {};
    return nomorTiket;
  }

  /**
   * REQ-2.5: panggilan berakhir atau terputus. Pengaduan yang belum bertiket disimpan sebagai `pengaduan_tidak_lengkap`
   * dengan data yang sudah terkumpul, tanpa nomor tiket. Tanpa data sama sekali (ditutup tepat setelah menekan 2), tidak ada
   * pengaduan yang disimpan; status percakapannya diurus di luar control ini. Aman dipanggil berulang (akhiri manual lalu koneksi putus):
   * status dibuang sebelum menunggu penyimpanan, jadi hanya panggilan pertama yang menyimpan.
   * Mengembalikan `{ pesan, tersimpan }` untuk panel, atau null bila panggilan ini bukan pengaduan yang belum selesai.
   */
  async panggilanBerakhir(id) {
    const s = this.sesi.get(id);
    this.sesi.delete(id);
    if (!s) return null;
    // Penerbitan yang sedang berjalan diselesaikan dulu: bila berhasil, pengaduan sudah lengkap dan tidak disimpan sebagai tidak lengkap.
    if (s.janji) await s.janji.catch(() => {});
    if (s.tiket !== null) return null;
    const lengkap = Object.keys(s.data).length;
    let tersimpan = false;
    if (lengkap > 0) {
      try {
        await this.gerbang?.simpanTidakLengkap({ percakapanId: id, ...s.data });
        tersimpan = Boolean(this.gerbang);
      } catch {
        // Galat penyimpanan dicatat pemanggil sebagai jenis saja; isi data pelapor tidak ikut.
      }
    }
    return { pesan: PESAN_PENGADUAN_TIDAK_LENGKAP, tersimpan, lengkap };
  }
}

/**
 * Satu giliran penelepon dalam alur pengaduan, seluruhnya di dalam gateway tanpa memanggil AI. Ucapan mentah
 * (nama, nomor telepon, kronologi) tidak pernah ditambahkan ke riwayat yang dikirim ke model.
 */
export async function prosesGiliranPengaduan({ pengaduan, riwayat, id, ucapan, ip }) {
  const hasil = await pengaduan.tangani(id, ucapan, { ip });
  riwayat.tambah(id, 'user', '(menyampaikan data pengaduan)');
  if (hasil.lengkap && hasil.tiket) {
    riwayat.tambah(id, 'assistant', hasil.jawaban);
    return { jawaban: hasil.jawaban, tiket: hasil.tiket, suara: null, tahap: 'tiket' };
  }
  riwayat.tambah(id, 'assistant', hasil.jawaban ?? '');
  // Belum ada suara statis untuk pesan ini di boundary, jadi panel hanya menampilkan teksnya.
  if (hasil.sudahBertiket) return { jawaban: hasil.jawaban, tiket: null, suara: null, tahap: 'sudah_bertiket' };
  return { jawaban: hasil.jawaban, tiket: null, suara: `/voice/statis/${hasil.suara}`, tahap: 'tanya_ulang', kurang: hasil.kurang?.length ?? 0 };
}
