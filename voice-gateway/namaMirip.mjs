// Control UC-01 (REQ-1.3, REQ-1.4): saran nama produk yang mirip saat cekbpom tidak menemukan nama yang terdengar.
// STT kadang menulis merek sesuai bunyinya ("panteen" untuk Pantene), dan cekbpom hanya mencari potongan teks yang persis,
// sehingga produk yang terdaftar tampak tidak ditemukan. Modul ini menyusun potongan kata untuk dicari di kolom merek
// cekbpom, lalu mengurutkan merek yang kembali berdasarkan kemiripan ejaan setelah dinormalkan menurut bunyi.
// Tanpa dependensi agar bisa diuji dengan `node --test`.

/** Kata minimal yang dicari kemiripannya; kata lebih pendek terlalu banyak cocok. */
const KATA_MIN = 4;
/** Paling banyak dua kata dari nama yang dicari kemiripannya, agar jumlah permintaan ke cekbpom tetap kecil. */
const KATA_MAKS = 2;
/** Kemiripan minimal (0 sampai 1). "panteen" ke "pantene" sekitar 0,86; dua huruf salah dari tujuh sekitar 0,71. */
export const AMBANG_MIRIP = 0.7;
export const SARAN_MAKS = 3;

/**
 * Bentuk bunyi sebuah kata: huruf kecil tanpa simbol, huruf kembar dirapatkan, dan ejaan yang bunyinya sama disamakan
 * (ph/f/v, c/k/q, z/s, x/ks, y/i, oo/u), sehingga "panteen", "panten", dan "pantene" berdekatan.
 */
export function bunyi(kata) {
  return String(kata ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')
    .replace(/ph/g, 'f').replace(/v/g, 'f').replace(/ck/g, 'k').replace(/[cq]/g, 'k').replace(/z/g, 's').replace(/x/g, 'ks')
    .replace(/y/g, 'i').replace(/oo/g, 'u').replace(/(.)\1+/g, '$1');
}

/** Jarak Damerau-Levenshtein (sisip, hapus, ganti, tukar dua huruf bersebelahan). */
export function jarak(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const beda = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + beda);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Kemiripan dua kata menurut bunyinya, 1 berarti sama. */
export function kemiripan(a, b) {
  const x = bunyi(a), y = bunyi(b);
  if (!x || !y) return 0;
  return 1 - jarak(x, y) / Math.max(x.length, y.length);
}

/** Kata dari nama yang dicari kemiripannya. */
export const kataDicari = (nama) => String(nama ?? '').toLowerCase().split(/\s+/).filter((k) => k.length >= KATA_MIN).slice(0, KATA_MAKS);

/**
 * Potongan kata untuk dicari di kolom merek cekbpom (pencarian potongan teks): empat huruf awal, dan empat huruf setelah huruf
 * pertama agar salah dengar di huruf pertama ("fantene") tetap menemukan mereknya.
 */
export function potonganCari(nama) {
  return [...new Set(kataDicari(nama).flatMap((k) => [k.slice(0, 4), ...(k.length >= 5 ? [k.slice(1, 5)] : [])]))];
}

const judul = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (h) => h.toUpperCase());

/**
 * Saran dari daftar merek hasil cekbpom: kata merek yang mirip dengan kata yang terdengar, paling mirip lebih dulu.
 * `label` diucapkan agen ("Pantene"), `kueri` adalah nama yang terdengar dengan kata itu diganti mereknya
 * ("panteen shampo" menjadi "pantene shampo") dan dipakai untuk mencari ulang bila penelepon memilihnya.
 */
export function saranNama(nama, daftarMerek, { ambang = AMBANG_MIRIP, maks = SARAN_MAKS } = {}) {
  const kataNama = String(nama ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const terbaik = new Map();
  for (const kata of kataDicari(nama)) {
    for (const merek of daftarMerek) {
      for (const k of String(merek ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= KATA_MIN - 1)) {
        if (k === kata) continue;
        const skor = kemiripan(kata, k);
        if (skor < ambang) continue;
        const kueri = kataNama.map((x) => (x === kata ? k : x)).join(' ');
        if (!terbaik.has(kueri) || terbaik.get(kueri).skor < skor) terbaik.set(kueri, { label: judul(k), kueri, skor: Math.round(skor * 100) / 100 });
      }
    }
  }
  return [...terbaik.values()].sort((a, b) => b.skor - a.skor || a.label.localeCompare(b.label)).slice(0, maks);
}
