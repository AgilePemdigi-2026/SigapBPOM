// Control UC-01 (F1.2, T-F1.2-03, REQ-1.3, REQ-1.4, REQ-1.5, BR-6, BR-7, NFR-7): tool `cek_registrasi_bpom` untuk Hermes Agent.
// Seperti cari_basis_pengetahuan (alatPengetahuan.mjs), Hermes dipanggil tanpa tool server (api_server: []), jadi gateway
// menjalankan tool ini atas nama agen lewat adapter cekbpom (cekbpom.mjs). Hasil tunggal, hasil ganda, hasil kosong, dan nama
// tidak jelas dijawab dengan kalimat baku tanpa memanggil AI, sehingga status dan nomor izin edar tidak mungkin dikarang
// model. Gangguan cekbpom diteruskan ke Hermes sebagai pesan sistem.
import { KANDIDAT_MAKS, cekRegistrasi, hasilProduk, kueriProduk, namaKurangJelas } from './cekbpom.mjs';
import { kemiripan } from './namaMirip.mjs';
import { PESAN_LAYANAN_1, PESAN_TAWARAN_PENUTUP } from './percakapan.mjs';

export const NAMA_TOOL = 'cek_registrasi_bpom';
/** REQ-1.4, BR-6: nama produk yang kurang jelas diminta ulang paling banyak dua kali. */
export const BATAS_ULANG_NAMA = 2;
// Pilihan kandidat diucapkan singkat ("nomor dua", "yang ketiga saja"); ucapan lebih panjang dianggap pertanyaan baru.
const KATA_PILIHAN_MAKS = 4;
const ANGKA_PILIHAN = { satu: 1, kesatu: 1, pertama: 1, dua: 2, kedua: 2, tiga: 3, ketiga: 3 };

/** Kamus pesan Lampiran A (UC-01 "Produk ditemukan"). */
export const pesanProdukDitemukan = (p) => `${p.nama} terdaftar dengan nomor izin edar ${p.nomorIzinEdar}, status izin ${p.status}.`;
/** Kamus pesan Lampiran A (UC-01 "Produk tidak ditemukan"). Sama dengan PESAN_TIDAK_DITEMUKAN di src/lib/kartuPanggilan.ts. */
export const PESAN_TIDAK_DITEMUKAN = 'Produk tidak ditemukan pada data registrasi BPOM. Tekan 2 untuk menyampaikan pengaduan.';
/**
 * REQ-1.4: nama tidak ditemukan tetapi ada merek yang bunyinya mirip (STT salah dengar, misalnya "panteen" untuk Pantene).
 * Kalimat pertama sama dengan kamus "Produk tidak ditemukan"; saran tidak menyebut status apa pun (NFR-7).
 */
export const pesanSaranNama = (saran) =>
  `Produk tidak ditemukan pada data registrasi BPOM. Mungkin maksudnya ${new Intl.ListFormat('id', { type: 'disjunction' }).format(saran.map((s) => s.label))}? `
  + 'Sebutkan nama yang benar, atau tekan 2 untuk menyampaikan pengaduan.';
/** Batas waktu mencari merek mirip; lewat dari itu penelepon langsung mendapat pesan tidak ditemukan. */
const BATAS_WAKTU_MIRIP_MS = 3000;
// Kemiripan minimal agar ucapan berikutnya dianggap menyebut salah satu saran ("panteen" lagi berarti Pantene).
const AMBANG_PILIH_SARAN = 0.85;
const POLA_SETUJU = /^(ya|iya|iyaa|yaa|betul|benar|bener|ok|oke|okay|yang itu|itu|itu dia)( (itu|kak|pak|bu|mbak|mas))?$/;

/** Kamus pesan Lampiran A (UC-01 "Nama tidak jelas"). */
export const PESAN_NAMA_TIDAK_JELAS = 'Maaf, nama produk kurang jelas. Mohon sebutkan kembali.';
/** Kamus pesan Lampiran A (UC-01 hasil ganda), SRS Tabel B.2 Alternative Path 4 (REQ-1.5, BR-7): "A atau B", "A, B, atau C". */
export const pesanHasilGanda = (total, kandidat) =>
  `Ditemukan ${total} produk. Pilih salah satu: ${new Intl.ListFormat('id', { type: 'disjunction' }).format(kandidat.map((p) => p.nama))}.`;

/** Definisi tool format function-calling OpenAI, dipakai sebagai kontrak nama dan parameter tool. */
export const DEFINISI_TOOL = Object.freeze({
  type: 'function',
  function: {
    name: NAMA_TOOL,
    description: 'Cari nomor izin edar dan status izin produk obat, makanan, atau kosmetik di data registrasi BPOM (cekbpom.pom.go.id). '
      + 'Isi salah satu parameter. Status registrasi dan nomor izin edar hanya boleh disebut dari hasil tool ini.',
    parameters: {
      type: 'object',
      properties: {
        nama_produk: { type: 'string', description: 'Nama atau merek produk seperti disebut penelepon.' },
        nomor_izin_edar: { type: 'string', description: 'Nomor izin edar di kemasan, misalnya MD 865009001234.' },
      },
      additionalProperties: false,
    },
  },
});

/** Pesan sistem untuk Hermes setelah nama produk diminta ulang BATAS_ULANG_NAMA kali dan masih kurang jelas (BR-6). */
export const PESAN_BATAS_ULANG_NAMA = `Hasil tool ${NAMA_TOOL}: nama produk sudah diminta ulang ${BATAS_ULANG_NAMA} kali dan masih kurang jelas. `
  + 'Jangan meminta nama produk lagi dan jangan menyebut status atau nomor izin edar apa pun. Sarankan penelepon memeriksa nomor izin edar '
  + 'di kemasan langsung di cekbpom.pom.go.id, atau tekan 2 untuk menyampaikan pengaduan.';

/** REQ-1.5: nomor kandidat yang dipilih penelepon ("nomor dua", "yang ketiga", "2"), atau null. */
export function nomorPilihan(ucapan, jumlah) {
  const kata = String(ucapan ?? '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter(Boolean);
  if (!kata.length || kata.length > KATA_PILIHAN_MAKS) return null;
  const nomor = kata.map((k) => ANGKA_PILIHAN[k] ?? (/^[1-9]$/.test(k) ? Number(k) : 0)).find((n) => n > 0);
  return nomor && nomor <= jumlah ? nomor : null;
}

const KEADAAN_AWAL = Object.freeze({ ulangNama: 0, kandidat: null, saran: null });

/**
 * Saran nama yang dipilih penelepon: nomornya, namanya (boleh salah dengar lagi), atau "iya", yang berarti saran pertama
 * (paling mirip dan disebut lebih dulu). Tanpa ini "iya" ikut dicari sebagai nama produk.
 */
export function saranDipilih(ucapan, saran) {
  const teks = String(ucapan ?? '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nomor = nomorPilihan(teks, saran.length);
  if (nomor) return saran[nomor - 1];
  if (POLA_SETUJU.test(teks)) return saran[0];
  const kata = teks.split(' ');
  const cocok = saran.filter((s) => kata.some((k) => kemiripan(k, s.label) >= AMBANG_PILIH_SARAN));
  return cocok.length === 1 ? cocok[0] : null;
}

async function cariMirip(cekBpom, nama) {
  if (!cekBpom.cariMirip || !nama) return [];
  let batas;
  const habis = new Promise((siap) => { batas = setTimeout(() => siap([]), BATAS_WAKTU_MIRIP_MS); });
  try { return await Promise.race([cekBpom.cariMirip(nama), habis]); } catch { return []; } finally { clearTimeout(batas); }
}

/** REQ-1.5: kandidat yang dipilih dengan menyebut namanya ("Susu Formula Sehat"), atau null bila nama cocok dengan lebih dari satu. */
function kandidatBernama(ucapan, kandidat) {
  const kata = kueriProduk(ucapan, true)?.nama?.split(' ');
  if (!kata) return null;
  const cocok = kandidat.filter((p) => kata.every((k) => p.nama.toLowerCase().includes(k)));
  return cocok.length === 1 ? cocok[0] : null;
}

function tunggal(produk, dasar) {
  return {
    ...dasar, jalur: 'tunggal', jawaban: `${pesanProdukDitemukan(produk)} ${PESAN_TAWARAN_PENUTUP}`, konteks: null,
    produk: hasilProduk({ produk: [produk] }), keadaan: KEADAAN_AWAL,
  };
}

/**
 * Jalankan tool untuk satu ucapan penelepon. `keadaan` berisi jawaban agen terakhir, jumlah permintaan ulang nama berturut-turut,
 * dan kandidat hasil ganda yang menunggu pilihan. Mengembalikan null bila ucapan bukan pertanyaan registrasi. Selain itu
 * `{ jalur, jawaban, konteks, produk, keadaan }`: `jawaban` kalimat baku yang langsung dibacakan tanpa AI, atau `konteks`
 * pesan sistem untuk Hermes. `produk` adalah HasilProduk untuk kartu panel, dan `keadaan` disimpan untuk giliran berikutnya.
 */
export async function cekRegistrasiBpom(cekBpom, ucapan, { jawabanTerakhir = '', ulangNama = 0, kandidat = null, saran = null, namaSaja = false, saatMencari = () => {} } = {}) {
  // REQ-1.4: penelepon memilih salah satu saran nama mirip; nama itu dicari ulang seperti disebut langsung.
  const saranPilihan = saran?.length ? saranDipilih(ucapan, saran) : null;
  if (saranPilihan) return cekRegistrasiBpom(cekBpom, saranPilihan.kueri, { namaSaja: true, saatMencari });

  const pilihan = kandidat?.length ? nomorPilihan(ucapan, kandidat.length) : null;
  const dipilih = pilihan ? kandidat[pilihan - 1] : kandidat?.length ? kandidatBernama(ucapan, kandidat) : null;
  if (dipilih) return tunggal(dipilih, { kueri: null, galat: null, total: 1 });

  // Setelah agen meminta nama produk (menu 1, nama tidak jelas, atau hasil ganda), nama saja sudah cukup.
  const setelahTanyaNama = namaSaja || jawabanTerakhir === PESAN_LAYANAN_1 || jawabanTerakhir === PESAN_NAMA_TIDAK_JELAS
    || Boolean(kandidat?.length) || Boolean(saran?.length);
  const cek = await cekRegistrasi(cekBpom, ucapan, setelahTanyaNama, saatMencari);
  if (!cek) {
    if (!namaKurangJelas(ucapan, setelahTanyaNama)) return null;
    const dasar = { kueri: null, galat: null, total: null, produk: undefined };
    if (ulangNama >= BATAS_ULANG_NAMA) {
      return { ...dasar, jalur: 'batas_ulang', jawaban: null, konteks: PESAN_BATAS_ULANG_NAMA, keadaan: { ulangNama, kandidat: null, saran: null } };
    }
    return { ...dasar, jalur: 'tidak_jelas', jawaban: PESAN_NAMA_TIDAK_JELAS, konteks: null, keadaan: { ulangNama: ulangNama + 1, kandidat: null, saran: null } };
  }

  const dasar = { kueri: cek.kueri, data: cek.data, galat: cek.galat, total: cek.data?.total ?? null, produk: cek.produk, keadaan: KEADAAN_AWAL };
  // NFR-7: cekbpom gagal tidak pernah menjadi "tidak ditemukan"; Hermes diminta menyampaikan gangguan tanpa status apa pun.
  if (!cek.data) return { ...dasar, jalur: 'gagal', jawaban: null, konteks: cek.konteks };
  const { produk } = cek.data;
  if (!produk.length) {
    // REQ-1.4: nama yang tidak ditemukan dicocokkan dengan merek yang bunyinya mirip; tanpa saran tetap pesan kamus.
    const mirip = cek.kueri.nama ? await cariMirip(cekBpom, cek.kueri.nama) : [];
    if (mirip.length) return { ...dasar, jalur: 'saran', jawaban: pesanSaranNama(mirip), konteks: null, keadaan: { ulangNama: 0, kandidat: null, saran: mirip } };
    return { ...dasar, jalur: 'tidak_ditemukan', jawaban: PESAN_TIDAK_DITEMUKAN, konteks: null };
  }
  if (produk.length === 1) return tunggal(produk[0], dasar);
  // REQ-1.5, BR-7: jumlah hasil dan paling banyak tiga kandidat dibacakan dengan kalimat baku, lalu penelepon memilih nomor atau namanya.
  const kandidatBaru = produk.slice(0, KANDIDAT_MAKS);
  return { ...dasar, jalur: 'ganda', jawaban: pesanHasilGanda(cek.data.total, kandidatBaru), konteks: null, keadaan: { ulangNama: 0, kandidat: kandidatBaru, saran: null } };
}
