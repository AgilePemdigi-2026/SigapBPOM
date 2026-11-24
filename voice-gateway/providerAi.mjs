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

/**
 * Profil Hermes sesuai provider: `{ url, kunci, model, batasWaktuMs, provider }`, atau null bila provider tidak diketahui
 * atau URL profilnya kosong. `batasWaktuMs` kosong berarti pemanggil memakai batas waktu bawaannya.
 */
export function targetHermes(provider, { cloud, lokal }) {
  const profil = provider === PROVIDER.CLOUD ? cloud : provider === PROVIDER.LOKAL ? lokal : null;
  // Profil yang tidak dikonfigurasi tidak pernah diganti profil lain; pemanggil mengeskalasi ke petugas.
  if (!profil?.url) return null;
  return { url: profil.url, kunci: profil.kunci, model: profil.model, batasWaktuMs: profil.batasWaktuMs, provider };
}

/**
 * Provider paling ketat yang pernah dipakai suatu panggilan. Sekali ada giliran lokal atau tidak diketahui, panggilan itu
 * tidak pernah kembali ke cloud; di antara keduanya yang terakhir terlihat yang dipakai. `lama` null berarti belum ada giliran.
 */
export function providerPalingKetat(lama, baru) {
  const nilai = NILAI_SAH.has(baru) ? baru : PROVIDER.TIDAK_DIKETAHUI;
  if (nilai === PROVIDER.CLOUD) return lama ?? PROVIDER.CLOUD;
  return nilai;
}

/** REQ-4.7: perangkat AI lokal gagal menjawab. Galat aslinya ada di `cause`. */
export class GalatProviderLokal extends Error {
  constructor(cause) {
    super('provider lokal gagal', { cause });
    this.name = 'GalatProviderLokal';
  }
}

/**
 * Membungkus aliran jawaban `alir(target)`. Di mode lokal galat apa pun (koneksi ditolak, batas waktu, status bukan 2xx,
 * atau pemberitahuan "hermes tanpa jawaban") menjadi GalatProviderLokal, supaya pemanggil mengucapkan PESAN_LOKAL_MATI
 * dan mengeskalasi, bukan mencoba profil cloud. Galat mode cloud diteruskan apa adanya.
 */
export async function* aliranDenganProvider({ target, alir }) {
  try {
    yield* alir(target);
  } catch (e) {
    if (target.provider === PROVIDER.LOKAL) throw new GalatProviderLokal(e);
    throw e;
  }
}

/** Peringkas sesuai provider: cloud atau lokal, dan tiruan tanpa AI bila provider tidak diketahui. */
export function pilihPeringkas(provider, { cloud, lokal, tiruan }) {
  if (provider === PROVIDER.CLOUD) return cloud;
  if (provider === PROVIDER.LOKAL) return lokal;
  return tiruan;
}

/**
 * Interface peringkas (`ringkas(transkrip, { provider }) -> { ringkasan, token }`). `provider` adalah provider paling ketat
 * yang tercatat selama panggilan; digabung dengan provider saat meringkas lewat providerPalingKetat, jadi transkrip
 * panggilan yang pernah berjalan lokal tidak pernah dikirim ke cloud walau petugas sudah beralih ke cloud.
 * Peringkas lokal yang gagal atau menghasilkan ringkasan kosong ("No reply" Hermes) diganti tiruan, tidak pernah cloud.
 */
export class PeringkasSesuaiProvider {
  constructor({ pemilih, cloud, lokal, tiruan }) {
    this.pemilih = pemilih;
    this.cloud = cloud;
    this.lokal = lokal;
    this.tiruan = tiruan;
  }

  async ringkas(transkrip, { provider: tercatat = null } = {}) {
    const provider = providerPalingKetat(tercatat, await this.pemilih.aktif());
    const peringkas = pilihPeringkas(provider, this);
    if (provider !== PROVIDER.LOKAL || peringkas === this.tiruan) return peringkas.ringkas(transkrip);
    try {
      const hasil = await peringkas.ringkas(transkrip);
      if (String(hasil?.ringkasan ?? '').trim()) return hasil;
    } catch {
      // Perangkat lokal mati: lanjut ke tiruan di bawah.
    }
    return this.tiruan.ringkas(transkrip);
  }
}
