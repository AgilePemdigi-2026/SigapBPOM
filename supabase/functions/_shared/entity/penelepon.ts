// Entity UC-01/UC-02: nomor telepon penelepon format Indonesia (T-F1.4-02) dan penyamarannya di transkrip (NFR-13).

// `08…` atau `+628…`, 10–13 digit setelah dinormalkan ke awalan 0.
const POLA_NOMOR_TELEPON = /^08\d{8,11}$/;

/** Mengembalikan nomor dalam bentuk `08…`, atau null bila formatnya tidak valid. */
export function normalkanNomorTelepon(masukan: string): string | null {
  const nomor = masukan.replace(/[\s-]/g, '').replace(/^\+62/, '0');
  return POLA_NOMOR_TELEPON.test(nomor) ? nomor : null;
}

// Angka dalam kata, seperti nomorTeleponDariUcapan di voice-gateway/eskalasi.mjs.
const KATA_ANGKA: Record<string, string> = {
  nol: '0', kosong: '0', satu: '1', dua: '2', tiga: '3', empat: '4', lima: '5', enam: '6', tujuh: '7', delapan: '8', sembilan: '9', plus: '+',
};
// Angka atau kata angka yang berdiri sendiri, jadi nomor izin edar (DBL0812...) dan kata seperti "kesatuan" tidak terpecah.
const POLA_TOKEN_ANGKA = new RegExp(`(?<![\\p{L}\\p{N}])(?:\\+?\\d+|${Object.keys(KATA_ANGKA).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
// Di antara angka satu nomor boleh ada tanda baca apa pun ("(0812) 3456/7890") dan kata ragu penelepon ("ee", "eh").
const POLA_JEDA = /^(?:[^\p{L}\p{N}]|(?<!\p{L})(?:e+h?|e?m+|h+m+|anu)(?!\p{L}))*$/iu;

const normalkan = (digit: string) => digit.replace(/^\+?62(?=8)/, '0');
const samar = (nomor: string) => `${nomor.slice(0, 4)}${'*'.repeat(nomor.length - 8)}${nomor.slice(-4)}`;

/**
 * NFR-13: nomor telepon `08…`, `62…`, atau `+628…` di dalam teks bebas, berupa angka atau kata, disamarkan seperti
 * "0812****7890". Bagian teks lain tidak berubah, termasuk angka sesudah nomor ("0812 3456 7890, 2 botol").
 */
export function samarkanNomorTelepon(teks: string): string {
  const token = [...teks.matchAll(POLA_TOKEN_ANGKA)].map((t) => ({
    awal: t.index, akhir: t.index + t[0].length, digit: KATA_ANGKA[t[0].toLowerCase()] ?? t[0],
  }));
  const ganti: [number, number, string][] = [];
  // Nomor bisa didahului angka lain ("2, 0812 3456 7890"), jadi awal nomor dicari dari kiri.
  for (let i = 0; i < token.length; i++) {
    let gabungan = '', nomor = '', ujung = -1;
    for (let j = i; j < token.length; j++) {
      if (j > i) {
        const jeda = teks.slice(token[j - 1].akhir, token[j].awal);
        if (!POLA_JEDA.test(jeda)) break;
        // Sesudah nomor sah, angka berikutnya ikut hanya bila melanjutkan kelompok yang sama ("0812 3456 78 90"),
        // bukan "0812 3456 7890, 2 botol" atau "0812 3456 7890 tiga kali".
        if (ujung >= 0 && !(/^\s+$/.test(jeda) && token[j].digit.length === token[j - 1].digit.length)) break;
      }
      gabungan += token[j].digit;
      const n = normalkan(gabungan);
      if (ujung >= 0 && n.length > 13) break;
      // Deret pertama yang sudah lebih dari 13 digit tetap disamarkan seluruhnya.
      if (/^08\d{8,}$/.test(n)) { nomor = n; ujung = j; }
      if (n.length >= 13) break;
    }
    if (ujung >= 0) {
      ganti.push([token[i].awal, token[ujung].akhir, nomor]);
      i = ujung;
    }
  }
  // Aturan gateway (nomorTeleponDariUcapan): seluruh angka dalam ucapan membentuk satu nomor, apa pun kata di antaranya.
  // Nomor yang dipakai gateway untuk tiket selalu ikut tersamar, misalnya "nol delapan satu dua, maaf, tiga empat ...".
  const semua = normalkan(token.map((t) => t.digit).join(''));
  if (!ganti.length && POLA_NOMOR_TELEPON.test(semua)) ganti.push([token[0].awal, token[token.length - 1].akhir, semua]);
  return ganti.reduceRight((s, [awal, akhir, nomor]) => `${s.slice(0, awal)}${samar(nomor)}${s.slice(akhir)}`, teks);
}
