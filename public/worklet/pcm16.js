// AudioWorklet transkrip live (REQ-1.2): audio mikrofon (Float32 pada sample rate AudioContext) diubah menjadi PCM 16-bit mono
// 16 kHz, format yang diminta STT realtime ElevenLabs, lalu dikirim ke panel per sekitar 250 ms.
// turunkan() murni agar bisa diuji dengan node --test; registerProcessor hanya ada di AudioWorkletGlobalScope.

export const RATE_KELUAR = 16000;
const SAMPEL_PER_KIRIM = 4000;

/** Rata-rata tiap `rasio` sampel masukan menjadi satu sampel Int16. Sisa yang belum genap satu sampel keluaran dikembalikan. */
export function turunkan(masuk, rasio) {
  const n = Math.floor(masuk.length / rasio);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const awal = Math.floor(i * rasio), akhir = Math.max(awal + 1, Math.floor((i + 1) * rasio));
    let jumlah = 0;
    for (let j = awal; j < akhir; j++) jumlah += masuk[j];
    const s = Math.max(-1, Math.min(1, jumlah / (akhir - awal)));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return { pcm, sisa: masuk.slice(Math.floor(n * rasio)) };
}

if (typeof registerProcessor === 'function') {
  registerProcessor('pcm16', class extends AudioWorkletProcessor {
    constructor() {
      super();
      this.rasio = sampleRate / RATE_KELUAR;
      this.sisa = new Float32Array(0);
      this.kumpulan = new Int16Array(SAMPEL_PER_KIRIM);
      this.isi = 0;
    }

    process([masuk]) {
      const kanal = masuk[0];
      if (!kanal) return true;
      const gabung = new Float32Array(this.sisa.length + kanal.length);
      gabung.set(this.sisa);
      gabung.set(kanal, this.sisa.length);
      const { pcm, sisa } = turunkan(gabung, this.rasio);
      this.sisa = sisa;
      for (const s of pcm) {
        this.kumpulan[this.isi++] = s;
        if (this.isi === SAMPEL_PER_KIRIM) {
          this.port.postMessage(this.kumpulan.buffer, [this.kumpulan.buffer]);
          this.kumpulan = new Int16Array(SAMPEL_PER_KIRIM);
          this.isi = 0;
        }
      }
      return true;
    }
  });
}
