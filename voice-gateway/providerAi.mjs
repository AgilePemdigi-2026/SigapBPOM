// UC-04: pemilih provider AI (cloud/lokal) yang dipilih petugas, dibaca dari Supabase lewat Edge Function provider-ai.
// Nilai tak dikenal atau gagal terbaca tidak pernah dipetakan ke cloud, supaya mode lokal tidak bocor ke layanan cloud.

export const PROVIDER = Object.freeze({ CLOUD: 'cloud', LOKAL: 'lokal', TIDAK_DIKETAHUI: 'tidak_diketahui' });

export const PESAN_LOKAL_MATI = 'Mohon maaf, perangkat AI lokal sedang tidak aktif. Pertanyaan Anda akan kami teruskan ke petugas. Mohon sebutkan nomor telepon Anda.';

const NILAI_SAH = new Set([PROVIDER.CLOUD, PROVIDER.LOKAL]);

export class PemilihProviderSupabase {
  constructor({ url, kunci, fetch = globalThis.fetch, now = Date.now, cacheMs = 5000, backoffMs = 5000 }) {
    this.url = url.replace(/\/+$/, '');
    this.kunci = kunci;
    this.fetch = fetch;
    this.now = now;
    this.cacheMs = cacheMs;
    this.backoffMs = backoffMs;
    this.nilai = PROVIDER.TIDAK_DIKETAHUI;
    this.dibacaPada = null;
    this.cobaLagiPada = null;
    this.berjalan = null;
  }

  /**
   * Tidak pernah melempar. Galat baca memakai nilai terakhir yang sah, atau 'tidak_diketahui' bila belum pernah terbaca.
   * Setelah gagal, Supabase tidak ditanya lagi selama backoffMs agar giliran bicara tidak menunggu batas waktu berulang.
   * Panggilan bersamaan berbagi satu fetch.
   */
  aktif() {
    if (this.berjalan) return this.berjalan;
    const sekarang = this.now();
    if (this.dibacaPada !== null && sekarang - this.dibacaPada < this.cacheMs) return Promise.resolve(this.nilai);
    if (this.cobaLagiPada !== null && sekarang < this.cobaLagiPada) return Promise.resolve(this.nilai);
    this.berjalan = this.#baca().finally(() => { this.berjalan = null; });
    return this.berjalan;
  }

  async #baca() {
    try {
      const res = await this.fetch(`${this.url}/functions/v1/provider-ai`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-sigap-kunci': this.kunci },
        body: '{}',
        signal: AbortSignal.timeout(3000),
      });
      const d = await res.json().catch(() => null);
      const provider = d?.data?.provider;
      if (!res.ok || !NILAI_SAH.has(provider)) throw new Error(`provider-ai ${res.status}`);
      this.nilai = provider;
      this.dibacaPada = this.now();
      this.cobaLagiPada = null;
    } catch {
      this.cobaLagiPada = this.now() + this.backoffMs;
    }
    return this.nilai;
  }
}

export class PemilihProviderTiruan {
  constructor(nilai = PROVIDER.CLOUD) {
    this.nilai = nilai;
  }

  async aktif() {
    return this.nilai;
  }
}
