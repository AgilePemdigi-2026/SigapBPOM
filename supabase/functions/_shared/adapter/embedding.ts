// Adapter embedding (PROJECT_RULES 4.3): interface tunggal dengan implementasi mock dan produksi (T-F1.3-02).

export interface PenyediaEmbedding {
  buatEmbedding(teks: string): Promise<number[]>;
}

export const DIMENSI_EMBEDDING = 1536;

/**
 * Pembuat embedding tiruan deterministik (1536 dimensi).
 * Menghasilkan vektor unit (norma L2 = 1) berdasarkan token kata teks,
 * sehingga teks dengan kata kunci serupa memiliki kemiripan kosinus tinggi (>= ambang),
 * sedangkan teks dengan kata kunci berbeda memiliki kemiripan mendekati 0.
 */
export function buatVektorTiruan(teks: string, dimensi = DIMENSI_EMBEDDING): number[] {
  const kataKunci = String(teks)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((k) => k.length > 1);

  const v = new Array<number>(dimensi).fill(0);
  if (kataKunci.length === 0) {
    v[0] = 1;
    return v;
  }

  for (const kata of kataKunci) {
    let h = 2166136261;
    for (let i = 0; i < kata.length; i++) {
      h = Math.imul(h ^ kata.charCodeAt(i), 16777619) >>> 0;
    }
    const idx = h % dimensi;
    v[idx] += 1;
  }

  let kuadrat = 0;
  for (let i = 0; i < dimensi; i++) kuadrat += v[i] * v[i];
  const norma = Math.sqrt(kuadrat) || 1;
  for (let i = 0; i < dimensi; i++) v[i] = Number((v[i] / norma).toFixed(6));
  return v;
}

export class PenyediaEmbeddingTiruan implements PenyediaEmbedding {
  vektorKustom: Map<string, number[]>;

  constructor(vektorKustom?: Record<string, number[]> | Map<string, number[]>) {
    this.vektorKustom = vektorKustom instanceof Map
      ? vektorKustom
      : new Map(Object.entries(vektorKustom ?? {}));
  }

  async buatEmbedding(teks: string): Promise<number[]> {
    const bersih = teks.trim();
    if (this.vektorKustom.has(bersih)) {
      return this.vektorKustom.get(bersih)!;
    }
    return buatVektorTiruan(bersih);
  }
}

export function buatPenyediaEmbedding(tipe?: string): PenyediaEmbedding {
  return new PenyediaEmbeddingTiruan();
}

