// PROJECT_RULES 5.2: login diberi batas laju per IP. Hitungan disimpan di memori proses server.
const BATAS_KUNCI = 5000;

// Alamat proxy internal (loopback, jaringan privat, jaringan Docker). Klien publik tidak bisa memakai alamat ini.
const ALAMAT_PRIVAT = /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|^::1$|^f[cd][0-9a-f]{2}:/i;

/**
 * Alamat klien. X-Forwarded-For hanya dipercaya bila koneksi datang dari reverse proxy internal (Caddy, ADR 0004).
 * Dari situ dipakai entri TERAKHIR, yang ditambahkan `reverse_proxy` Caddy, karena entri sebelumnya bisa dipalsukan klien. Syarat: port Astro tidak dipublikasikan ke luar Docker, sebab
 * userland-proxy Docker membuat klien luar tampak dari 172.x. Klien yang tersambung langsung memakai alamat soketnya.
 */
export function ipKlien(headers: Headers, alamatSoket: string): string {
  return kunciAlamat(alamatKlien(headers, alamatSoket));
}

/**
 * Alamat klien mentah (tanpa pengelompokan /64), aturannya sama dengan ipKlien.
 * PERCAYA_CF_CONNECTING_IP=1 untuk deployment di balik Cloudflare yang port asalnya tertutup (Coolify): proxy di depan
 * Astro mengganti X-Forwarded-For, sedangkan CF-Connecting-IP diisi Cloudflare dan tidak bisa dipalsukan klien. Jangan
 * dinyalakan bila server bisa dicapai tanpa Cloudflare.
 */
export function alamatKlien(headers: Headers, alamatSoket: string, percayaCf = process.env.PERCAYA_CF_CONNECTING_IP === '1'): string {
  if (!ALAMAT_PRIVAT.test(alamatSoket)) return alamatSoket;
  const cf = percayaCf ? headers.get('cf-connecting-ip')?.trim() : '';
  if (cf) return cf;
  const xff = (headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.at(-1) ?? alamatSoket;
}

/** IPv6 dihitung per blok /64 (satu pelanggan biasanya memegang satu blok), agar tabel tidak mudah dipenuhi. */
export function kunciAlamat(ip: string): string {
  if (!ip.includes(':') || ip.startsWith('::ffff:')) return ip;
  const [kepala, ekor = ''] = ip.split('::');
  const depan = kepala ? kepala.split(':') : [];
  const belakang = ekor ? ekor.split(':') : [];
  const penuh = ip.includes('::') ? [...depan, ...Array(8 - depan.length - belakang.length).fill('0'), ...belakang] : depan;
  return `${penuh.slice(0, 4).map((b) => b.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
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
