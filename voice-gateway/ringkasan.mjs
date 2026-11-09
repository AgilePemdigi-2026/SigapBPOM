// Control UC-05 ringkasan percakapan (T-F6.3-01, REQ-5.2, NFR-20): saat panggilan berakhir gateway meminta AI meringkas
// transkrip, lalu menyimpannya ke percakapan.ringkasan lewat Edge Function catat-percakapan (aksi `ringkasan`).
// Nomor telepon dan nama pelapor disamarkan sebelum transkrip dikirim ke model dan sekali lagi pada hasilnya.
// Peringkasan berjalan setelah panggilan ditutup dan galatnya hanya diteruskan ke `onGalat`, jadi tidak pernah menahan penutupan.

/** Batas ringkasan, sama dengan PANJANG_MAKS_RINGKASAN di supabase/functions/_shared/control/TranskripController.ts. */
export const PANJANG_MAKS_RINGKASAN = 500;
const GILIRAN_MAKS = 40;
const PANJANG_MAKS_TRANSKRIP = 6_000;

export const TANDA_NOMOR = '[nomor telepon]';
export const TANDA_NAMA = '[nama pelapor]';

// Kata angka yang lazim muncul saat penelepon menyebut nomor ("kosong delapan satu dua", "empat belas").
const KATA_ANGKA = new Set([
  'nol', 'kosong', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'lapan', 'sembilan',
  'sepuluh', 'sebelas', 'belas', 'puluh', 'plus',
]);
const bersih = (kata) => kata.toLowerCase().replace(/[^\p{L}\p{N}+]/gu, '');
const kataAngka = (kata) => {
  const k = bersih(kata);
  return k !== '' && (/^\+?\d+$/.test(k) || KATA_ANGKA.has(k));
};
const jumlahDigit = (kata) => kata.reduce((n, k) => n + (/^\+?\d+$/.test(bersih(k)) ? bersih(k).replace('+', '').length : 1), 0);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * NFR-13: menyamarkan data pribadi di teks bebas. Deretan angka atau kata angka sepanjang enam digit atau lebih menjadi
 * TANDA_NOMOR; nama pelapor yang diketahui (utuh maupun per kata, tiga huruf ke atas) menjadi TANDA_NAMA.
 */
export function samarkanDataPribadi(teks, { nama = [] } = {}) {
  const kata = String(teks ?? '').split(/(\s+)/);
  const keluar = [];
  for (let i = 0; i < kata.length; i++) {
    if (!kataAngka(kata[i])) { keluar.push(kata[i]); continue; }
    // Kumpulkan deret kata angka yang hanya dipisah spasi.
    let j = i;
    const deret = [];
    while (j < kata.length && (kataAngka(kata[j]) || (/^\s+$/.test(kata[j]) && kataAngka(kata[j + 1] ?? '')))) {
      if (!/^\s+$/.test(kata[j])) deret.push(kata[j]);
      j++;
    }
    if (jumlahDigit(deret) >= 6) {
      // Tanda baca di tepi deret ("(0812…)," atau "…7890.") tetap dipertahankan.
      const awal = deret[0].match(/^[^\p{L}\p{N}+]+/u)?.[0] ?? '';
      const akhir = deret.at(-1).match(/[^\p{L}\p{N}]+$/u)?.[0] ?? '';
      keluar.push(awal + TANDA_NOMOR + akhir);
    } else {
      keluar.push(...kata.slice(i, j));
    }
    i = j - 1;
  }
  let hasil = keluar.join('');
  const bagian = [...new Set(nama.flatMap((n) => {
    const utuh = String(n ?? '').trim();
    return utuh ? [utuh, ...utuh.split(/\s+/).filter((k) => k.replace(/[^\p{L}]/gu, '').length >= 3)] : [];
  }))].sort((a, b) => b.length - a.length);
  for (const b of bagian) hasil = hasil.replace(new RegExp(`(?<![\\p{L}])${escapeRegex(b)}(?![\\p{L}])`, 'giu'), TANDA_NAMA);
  return hasil.replace(/\[nama pelapor\](\s+\[nama pelapor\])+/g, TANDA_NAMA);
}

export const PROMPT_RINGKASAN = [
  'Anda meringkas transkrip panggilan layanan informasi BPOM untuk petugas.',
  'Tulis satu paragraf bahasa Indonesia, paling banyak tiga kalimat: keperluan penelepon, produk yang dibahas, dan hasil panggilan',
  '(dijawab, dieskalasi ke petugas, tiket pengaduan terbit, atau pengaduan tidak lengkap).',
  `Jangan menulis nomor telepon, nama orang, atau data pribadi lain; biarkan tanda ${TANDA_NOMOR} dan ${TANDA_NAMA} apa adanya atau hilangkan.`,
  'Jangan menambah informasi yang tidak ada di transkrip. Tulis ringkasannya saja tanpa pembuka.',
].join(' ');

/** Interface peringkas: `ringkas(transkrip) -> { ringkasan, token }`. Tiruan tanpa AI dipakai saat Hermes tidak dikonfigurasi. */
export class PeringkasTiruan {
  async ringkas(transkrip) {
    const pertama = transkrip.split('\n').find((b) => b.startsWith('Penelepon: '))?.slice('Penelepon: '.length) ?? '';
    return { ringkasan: pertama ? `Penelepon menanyakan: ${pertama}` : '', token: 0 };
  }
}

/** Implementasi lewat Hermes (endpoint OpenAI-compatible yang sama dengan giliran suara), tanpa streaming. */
export class PeringkasHermes {
  constructor({ url, kunci, model, batasWaktuMs = 20_000 }) {
    this.url = url.replace(/\/$/, '');
    this.kunci = kunci;
    this.model = model;
    this.batasWaktuMs = batasWaktuMs;
  }

  async ringkas(transkrip) {
    const r = await fetch(`${this.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.kunci}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [{ role: 'system', content: PROMPT_RINGKASAN }, { role: 'user', content: transkrip }],
      }),
      signal: AbortSignal.timeout(this.batasWaktuMs),
    });
    if (!r.ok) throw new Error(`ringkasan ${r.status}`);
    const d = await r.json();
    const ringkasan = String(d?.choices?.[0]?.message?.content ?? '').trim();
    const token = Number(d?.usage?.total_tokens ?? 0);
    // Pemberitahuan internal Hermes (misalnya "⚠️ No reply: ...") bukan ringkasan; tokennya tetap dihitung pemanggil.
    if (/^\s*(⚠|\[?error\b)/iu.test(ringkasan)) return { ringkasan: '', token };
    return { ringkasan, token };
  }
}

/**
 * Mengumpulkan giliran per panggilan lalu meringkasnya saat `akhiri(id)`. Hanya panggilan yang baris percakapannya sudah
 * dibuat (`tercatat`) yang diringkas. Pemakaian token masuk `anggaran` (AnggaranToken) atas IP penelepon, dan peringkasan
 * dilewati bila anggaran harian habis. Data pribadi dari `dataPribadi(id)` (nama dan nomor pelapor) dikumpulkan tiap giliran
 * karena sesi pengaduan sudah dibuang saat panggilan berakhir.
 */
export class PeringkasPercakapan {
  constructor({ peringkas, pengirim, anggaran = null, dataPribadi = () => [], onGalat = () => {}, maks = 200 }) {
    this.peringkas = peringkas;
    this.pengirim = pengirim;
    this.anggaran = anggaran;
    this.dataPribadi = dataPribadi;
    this.onGalat = onGalat;
    this.maks = maks;
    this.sesi = new Map();
  }

  ambil(id) {
    let s = this.sesi.get(id);
    if (s) return s;
    if (this.sesi.size >= this.maks) {
      const semua = [...this.sesi];
      this.sesi.delete((semua.find(([, v]) => !v.tercatat) ?? semua[0])[0]);
    }
    s = { tercatat: false, ip: '', giliran: [], nama: new Set() };
    this.sesi.set(id, s);
    return s;
  }

  tercatat(id) {
    this.ambil(id).tercatat = true;
  }

  giliran(id, ip, ucapan, jawaban) {
    const s = this.ambil(id);
    if (ip) s.ip = ip;
    for (const n of this.dataPribadi(id) ?? []) if (n) s.nama.add(String(n));
    if (s.giliran.length >= GILIRAN_MAKS) return;
    if (ucapan) s.giliran.push(`Penelepon: ${ucapan}`);
    if (jawaban) s.giliran.push(`Agen: ${jawaban}`);
  }

  /** Mengembalikan ringkasan yang tersimpan, atau null bila dilewati atau gagal. Tidak pernah melempar. */
  async akhiri(id) {
    const s = this.sesi.get(id);
    this.sesi.delete(id);
    if (!s?.tercatat || !s.giliran.some((g) => g.startsWith('Penelepon: '))) return null;
    if (this.anggaran?.cek(s.ip, id) === 'harian') return null;
    const opsi = { nama: [...s.nama] };
    const transkrip = samarkanDataPribadi(s.giliran.join('\n'), opsi).slice(-PANJANG_MAKS_TRANSKRIP);
    try {
      const { ringkasan, token } = await this.peringkas.ringkas(transkrip);
      if (token) this.anggaran?.catat(s.ip, id, token);
      const teks = samarkanDataPribadi(String(ringkasan ?? '').replace(/\s+/g, ' ').trim(), opsi).slice(0, PANJANG_MAKS_RINGKASAN).trim();
      if (!teks) return null;
      await this.pengirim.kirim({ aksi: 'ringkasan', percakapanId: id, ringkasan: teks });
      return teks;
    } catch (e) {
      this.onGalat(e);
      return null;
    }
  }
}
