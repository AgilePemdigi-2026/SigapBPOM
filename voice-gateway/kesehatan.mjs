// Control UC-04 kesehatan komponen gateway (T-F5.4-01, NFR-1, NFR-16): hasil dan latensi panggilan nyata terakhir ke Hermes,
// STT, TTS, dan cekbpom untuk halaman Pantau AI Agent. Hanya status dan durasi yang disimpan, tanpa isi permintaan.
// Nilainya null sampai layanan itu dipanggil pertama kali sejak gateway mulai.
// ponytail: pasif (panggilan nyata terakhir); tambahkan probe aktif bila masa sepi menyembunyikan gangguan.

// Penolakan masukan (rekaman rusak, terlalu besar, format tidak didukung) bisa dipicu klien publik mana pun, jadi tidak dicatat
// sebagai gangguan. 401, 403, 429, 5xx, batas waktu, dan galat jaringan tetap tercatat tidak sehat.
const STATUS_PENOLAKAN_MASUKAN = new Set([400, 413, 415, 422]);

export class KondisiLayanan {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.terakhir = { hermes: null, stt: null, tts: null, cekbpom: null };
  }

  catat(nama, sehat, latensiMs) {
    this.terakhir[nama] = { sehat, latensiMs: Math.round(latensiMs), waktu: new Date(this.now()).toISOString() };
  }

  /** Jalankan `kerja`, catat berhasil tidaknya beserta durasinya, lalu kembalikan hasilnya atau lempar ulang galat aslinya. */
  async ukur(nama, kerja) {
    const mulai = this.now();
    try {
      const hasil = await kerja();
      this.catat(nama, true, this.now() - mulai);
      return hasil;
    } catch (e) {
      if (!STATUS_PENOLAKAN_MASUKAN.has(e?.status)) this.catat(nama, false, this.now() - mulai);
      throw e;
    }
  }
}
