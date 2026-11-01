// PROJECT_RULES 5.2: login diberi batas laju per IP. Hitungan disimpan di memori proses server.
const BATAS_KUNCI = 5000;

/**
 * Alamat klien di balik Caddy. Caddy menambahkan alamat klien sebagai entri TERAKHIR X-Forwarded-For;
 * entri sebelumnya bisa dipalsukan klien, jadi tidak dipakai (pola sama dengan voice-gateway/server.mjs).
 * Tanpa header, dipakai alamat soket.
 */
export function ipKlien(headers: Headers, alamatSoket: string): string {
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
    const boleh = terbaru.length < this.maks;
    if (boleh) terbaru.push(sekarang);
    this.percobaan.set(kunci, terbaru);
    if (this.percobaan.size > BATAS_KUNCI) {
      for (const [k, daftar] of this.percobaan) if (daftar.every((t) => sekarang - t >= this.jendelaMs)) this.percobaan.delete(k);
      // Masih penuh (banyak alamat aktif): buang kunci tertua agar memori tetap terbatas.
      for (const k of this.percobaan.keys()) {
        if (this.percobaan.size <= BATAS_KUNCI) break;
        this.percobaan.delete(k);
      }
    }
    return boleh;
  }
}
