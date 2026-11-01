// Adapter penyedia embedding (PROJECT_RULES 4.3): interface tunggal dengan implementasi mock.
// Menghasilkan embedding 1536 dimensi (sesuai pgvector vector(1536)).

export interface PenyediaEmbedding {
  buatEmbedding(teks: string): Promise<number[]>;
}

export class PenyediaEmbeddingMock implements PenyediaEmbedding {
  dimensi: number;

  constructor(dimensi = 1536) {
    this.dimensi = dimensi;
  }

  async buatEmbedding(teks: string): Promise<number[]> {
    const vektor = new Array<number>(this.dimensi);
    let hash = 0;
    for (let i = 0; i < teks.length; i++) {
      hash = (hash << 5) - hash + teks.charCodeAt(i);
      hash |= 0;
    }

    let magnitudoKuadrat = 0;
    for (let i = 0; i < this.dimensi; i++) {
      const v = Math.sin(hash + i);
      vektor[i] = v;
      magnitudoKuadrat += v * v;
    }

    const norm = Math.sqrt(magnitudoKuadrat) || 1;
    for (let i = 0; i < this.dimensi; i++) {
      vektor[i] = Number((vektor[i] / norm).toFixed(6));
    }

    return vektor;
  }
}

export function buatPenyediaEmbedding(jenis = 'tiruan'): PenyediaEmbedding {
  return new PenyediaEmbeddingMock();
}
