// Control UC-01 (F1.2, T-F1.2-03, REQ-1.3, REQ-1.4, REQ-1.5, BR-6, BR-7, NFR-7): tool `cek_registrasi_bpom` untuk Hermes Agent.
// Seperti cari_basis_pengetahuan (alatPengetahuan.mjs), Hermes dipanggil tanpa tool server (api_server: []), jadi gateway
// menjalankan tool ini atas nama agen lewat adapter cekbpom (cekbpom.mjs). Hasil tunggal, hasil kosong, dan nama tidak jelas
// dijawab dengan kalimat baku kamus pesan tanpa memanggil AI, sehingga status dan nomor izin edar tidak mungkin dikarang
// model. Hasil ganda dan gangguan cekbpom diteruskan ke Hermes sebagai pesan sistem.
import { KANDIDAT_MAKS, cekRegistrasi, hasilProduk, namaKurangJelas } from './cekbpom.mjs';
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
/** Kamus pesan Lampiran A (UC-01 "Nama tidak jelas"). */
export const PESAN_NAMA_TIDAK_JELAS = 'Maaf, nama produk kurang jelas. Mohon sebutkan kembali.';

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

const KEADAAN_AWAL = Object.freeze({ ulangNama: 0, kandidat: null });

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
export async function cekRegistrasiBpom(cekBpom, ucapan, { jawabanTerakhir = '', ulangNama = 0, kandidat = null } = {}) {
  const pilihan = kandidat?.length ? nomorPilihan(ucapan, kandidat.length) : null;
  if (pilihan) return tunggal(kandidat[pilihan - 1], { kueri: null, galat: null, total: 1 });

  // Setelah agen meminta nama produk (menu 1, nama tidak jelas, atau hasil ganda), nama saja sudah cukup.
  const setelahTanyaNama = jawabanTerakhir === PESAN_LAYANAN_1 || jawabanTerakhir === PESAN_NAMA_TIDAK_JELAS || Boolean(kandidat?.length);
  const cek = await cekRegistrasi(cekBpom, ucapan, setelahTanyaNama);
  if (!cek) {
    if (!namaKurangJelas(ucapan, setelahTanyaNama)) return null;
    const dasar = { kueri: null, galat: null, total: null, produk: undefined };
    if (ulangNama >= BATAS_ULANG_NAMA) {
      return { ...dasar, jalur: 'batas_ulang', jawaban: null, konteks: PESAN_BATAS_ULANG_NAMA, keadaan: { ulangNama, kandidat: null } };
    }
    return { ...dasar, jalur: 'tidak_jelas', jawaban: PESAN_NAMA_TIDAK_JELAS, konteks: null, keadaan: { ulangNama: ulangNama + 1, kandidat: null } };
  }

  const dasar = { kueri: cek.kueri, galat: cek.galat, total: cek.data?.total ?? null, produk: cek.produk, keadaan: KEADAAN_AWAL };
  // NFR-7: cekbpom gagal tidak pernah menjadi "tidak ditemukan"; Hermes diminta menyampaikan gangguan tanpa status apa pun.
  if (!cek.data) return { ...dasar, jalur: 'gagal', jawaban: null, konteks: cek.konteks };
  const { produk } = cek.data;
  if (!produk.length) return { ...dasar, jalur: 'tidak_ditemukan', jawaban: PESAN_TIDAK_DITEMUKAN, konteks: null };
  if (produk.length === 1) return tunggal(produk[0], dasar);
  // REQ-1.5, BR-7: jumlah hasil dan paling banyak tiga kandidat dibacakan Hermes, lalu penelepon memilih nomornya.
  return { ...dasar, jalur: 'ganda', jawaban: null, konteks: cek.konteks, keadaan: { ulangNama: 0, kandidat: produk.slice(0, KANDIDAT_MAKS) } };
}
