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

// Padanan ejaan dan bahasa: nama di cekbpom bercampur bahasa Indonesia dan Inggris ("Susu UHT Rasa Cokelat", "Barber Daily
// Dandruff Shampoo"), sedangkan penelepon dan STT memakai ejaannya sendiri ("coklat", "shampo", "ketombe"). Satu baris satu
// kelompok; setiap kata di kelompok dianggap sama. Tambahkan kelompok baru di sini bila ditemukan kasus lain.
const KELOMPOK_PADANAN = `
  coklat cokelat chocolate choco
  shampo sampo shampoo
  krim krem cream
  sabun soap wash
  susu milk
  teh tea
  kopi coffee
  jus juice
  sirup sirop syrup
  saus saos sauce
  mie mi noodle noodles
  biskuit biscuit biscuits
  keju cheese
  stroberi strawberry
  anggur grape
  jeruk orange
  mangga mango
  vanila vanilla
  pisang banana
  madu honey
  minyak oil
  bubuk serbuk powder
  kapsul capsule capsules
  salep ointment
  losion lotion
  pelembab pelembap moisturizer moisturiser moisturizing moisturising
  pembersih cleanser
  masker mask
  wajah muka face
  rambut hair
  badan tubuh body
  bayi baby
  anak kids
  ketombe dandruff
  jerawat acne
  pemutih whitening
  wangi parfum perfume
`.trim().split('\n').map((b) => b.trim().split(/\s+/));
const PADANAN = new Map(KELOMPOK_PADANAN.flatMap((g) => g.map((k) => [k, g.filter((x) => x !== k)])));

/** Padanan ejaan atau bahasa sebuah kata ("coklat" -> cokelat, chocolate, choco), tanpa kata itu sendiri. */
export const padanan = (kata) => PADANAN.get(String(kata ?? '').toLowerCase()) ?? [];

// Jenis produk yang lazim disebut di depan nama ("sabun barber daily"), padahal nama di cekbpom sering memakai istilah lain
// ("Body Wash"). Kata ini boleh tidak cocok selama kata lain cocok. Rasa dan kegunaan ("coklat", "ketombe") tetap wajib cocok.
const JENIS_PRODUK = new Set(`susu milk sabun soap wash shampo sampo shampoo krim krem cream obat sirup sirop syrup minuman
  makanan kopi coffee teh tea minyak oil salep ointment tablet kapsul capsule capsules serum lotion losion bedak lipstik parfum
  perfume permen candy biskuit biscuit biscuits roti jamu suplemen vitamin pasta gigi masker mask cairan bubuk serbuk powder
  mie mi noodle noodles jus juice saus saos sauce`.split(/\s+/));

// Kata umum yang bukan penanda produk tertentu: jenis produk, rasa, kemasan, dan kata berpadanan. Kata ini tidak dicarikan
// merek mirip ("susu" bukan "Susut") dan tidak dipakai sebagai kata khas saat mencari ulang.
const KATA_UMUM = new Set([
  ...JENIS_PRODUK,
  ...'rasa varian ukuran botol kemasan isi gram kilo liter merek produk original asli baru anak dewasa'.split(' '),
  ...KELOMPOK_PADANAN.flat(),
]);

/** Kata umum (jenis produk, rasa, kemasan, atau kata berpadanan), bukan nama khas sebuah produk. */
export const kataUmum = (kata) => KATA_UMUM.has(String(kata ?? '').toLowerCase());

/** Jenis produk ("sabun", "susu", "shampo"). */
export const jenisProduk = (kata) => JENIS_PRODUK.has(String(kata ?? '').toLowerCase());

// Kategori umum yang jarang tertulis di nama produk cekbpom ("obat tolak angin" terdaftar sebagai "TOLAK ANGIN ..."). Hanya
// kata ini yang boleh tidak cocok. Jenis konkret seperti susu, sabun, atau krim tetap wajib cocok, langsung atau lewat
// padanannya, agar "susu bendera coklat" tidak menemukan cokelat butir bermerek LAGIE BENDERA.
const BOLEH_DIABAIKAN = new Set('obat jamu suplemen vitamin minuman makanan produk cairan herbal'.split(' '));

/** Kata kategori umum yang boleh tidak ada di nama produk cekbpom. */
export const bolehDiabaikan = (kata) => BOLEH_DIABAIKAN.has(String(kata ?? '').toLowerCase());

/** Kata dari nama yang dicari kemiripannya: bukan kata umum, minimal empat huruf, paling banyak dua kata. */
export const kataDicari = (nama) => String(nama ?? '').toLowerCase().split(/\s+/)
  .filter((k) => k.length >= KATA_MIN && !kataUmum(k)).slice(0, KATA_MAKS);

/** Kemiripan ejaan minimal agar sebuah kata dianggap ada di nama produk ("coklat" dan Cokelat sekitar 0,86). */
export const AMBANG_KATA = 0.8;

/**
 * Teks produk memuat kata yang diucapkan secara longgar: persis sebagai potongan teks, sebagai padanannya ("coklat" untuk
 * Chocolate), dengan spasi diabaikan ("ultramilk" untuk Ultra Milk), atau dengan ejaan yang mirip ("shampo" untuk Shampoo).
 */
export function memuatKata(teks, kata) {
  const t = String(teks ?? '').toLowerCase();
  const k = String(kata ?? '').toLowerCase();
  if (!k) return true;
  const token = t.split(/[^a-z0-9]+/).filter(Boolean);
  // Kata pendek ("mi", "tea") dicocokkan per kata utuh agar tidak cocok dengan potongan kata lain ("minyak", "steam").
  const ada = (x) => (x.length >= 4 ? t.includes(x) : token.includes(x));
  if (ada(k) || padanan(k).some(ada)) return true;
  if (k.length >= 5 && token.join('').includes(k)) return true;
  return token.some((x) => kemiripan(k, x) >= AMBANG_KATA);
}

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
