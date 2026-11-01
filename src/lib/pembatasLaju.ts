// PROJECT_RULES 5.2: login diberi batas laju per IP. Hitungan disimpan di memori proses server.
const BATAS_KUNCI = 5000;

// Alamat proxy internal (loopback, jaringan privat, jaringan Docker). Klien publik tidak bisa memakai alamat ini.
const ALAMAT_PRIVAT = /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|^::1$|^f[cd][0-9a-f]{2}:/i;

/**
 * Alamat klien. X-Forwarded-For hanya dipercaya bila koneksi datang dari proxy internal (Caddy);
 * dari situ dipakai entri TERAKHIR yang ditambahkan Caddy, karena entri sebelumnya bisa dipalsukan klien
 * (pola sama dengan voice-gateway/server.mjs). Klien yang tersambung langsung memakai alamat soketnya.
 */
export function ipKlien(headers: Headers, alamatSoket: string): string {
  if (!ALAMAT_PRIVAT.test(alamatSoket)) return alamatSoket;
  const xff = (headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.at(-1) ?? alamatSoket;
}

export class PembatasLaju {
  maks: number;
  jendelaMs: number;
  now: () => number;
  percobaan = new Map<string, number[]>();

  constructor(opsi: { maks?: number; jendelaMs?: number; now?: () => number } = {}) {
    this.maks = opsi.maks ?? 20;
    this.jendelaMs = opsi.jendelaMs ?? 15 * 60_000;
    this.now = opsi.now ?? Date.now;
  }

  /** Mencatat satu percobaan. False bila kunci sudah melewati batas dalam jendela waktu. */
  izinkan(kunci: string): boolean {
    const sekarang = this.now();
    const terbaru = (this.percobaan.get(kunci) ?? []).filter((t) => sekarang - t < this.jendelaMs);
    if (!this.percobaan.has(kunci) && this.percobaan.size >= BATAS_KUNCI && !this.beriRuang(sekarang)) return false;
    const boleh = terbaru.length < this.maks;
    if (boleh) terbaru.push(sekarang);
    this.percobaan.set(kunci, terbaru);
    return boleh;
  }

  /**
   * Membuang kunci yang jendelanya habis, lalu kunci tertua yang belum mencapai batas. Kunci yang sedang
   * diblokir tidak pernah dibuang; bila semuanya diblokir, kunci baru ditolak (gagal tertutup).
   */
  private beriRuang(sekarang: number): boolean {
    for (const [k, daftar] of this.percobaan) if (daftar.every((t) => sekarang - t >= this.jendelaMs)) this.percobaan.delete(k);
    for (const [k, daftar] of this.percobaan) {
      if (this.percobaan.size < BATAS_KUNCI) break;
      if (daftar.filter((t) => sekarang - t < this.jendelaMs).length < this.maks) this.percobaan.delete(k);
    }
    return this.percobaan.size < BATAS_KUNCI;
  }
}
