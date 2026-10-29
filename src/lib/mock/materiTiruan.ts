// Mock penyimpanan materi: memori server, tanpa Supabase (PROJECT_RULES 4.3).
// Mendukung operasi penonaktifan dan pencarian RAG tanpa mengembalikan materi tidak aktif.
import type {
  InfoPembaruanMateri,
  PenyimpananMateri,
  PotonganPencarian,
} from '../BasisPengetahuanController.ts';

export type ItemMateriTiruan = {
  id: string;
  judul: string;
  kategori?: string;
  rujukanSumber: string;
  isi?: string;
  status: 'aktif' | 'tidak_aktif';
  diperbaruiOleh?: string;
  diperbaruiPada?: Date;
  potongan?: { id: string; teks: string; embedding?: number[] }[];
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Menyimpan status nonaktif dan data materi di memori server. */
export class PenyimpananMateriTiruan implements PenyimpananMateri {
  private materiMap = new Map<string, ItemMateriTiruan>();
  private pembaruanMap = new Map<string, InfoPembaruanMateri>();

  constructor(initialMateri?: ItemMateriTiruan[]) {
    if (initialMateri) {
      for (const m of initialMateri) {
        this.materiMap.set(m.id, { ...m });
      }
    }
  }

  async nonaktifkan(materiId: string, petugasId: string): Promise<boolean> {
    const now = new Date();
    const existing = this.materiMap.get(materiId);

    if (existing) {
      existing.status = 'tidak_aktif';
      existing.diperbaruiOleh = petugasId;
      existing.diperbaruiPada = now;
    } else {
      // Izinkan ID dari data tiruan UI
      this.materiMap.set(materiId, {
        id: materiId,
        judul: `Materi ${materiId}`,
        rujukanSumber: 'Peraturan BPOM',
        status: 'tidak_aktif',
        diperbaruiOleh: petugasId,
        diperbaruiPada: now,
      });
    }

    this.pembaruanMap.set(materiId, {
      materiId,
      status: 'tidak_aktif',
      diperbaruiOleh: petugasId,
      diperbaruiPada: now,
    });

    return true;
  }

  apakahNonaktif(materiId: string): boolean {
    const m = this.materiMap.get(materiId);
    if (m) return m.status === 'tidak_aktif';
    return this.pembaruanMap.get(materiId)?.status === 'tidak_aktif';
  }

  async ambilPembaruan(materiId: string): Promise<InfoPembaruanMateri | null> {
    return this.pembaruanMap.get(materiId) ?? null;
  }

  /**
   * REQ-7.3, BR-5: Potongan dari materi berstatus 'tidak_aktif' TIDAK PERNAH dikembalikan.
   */
  async cariPotongan(queryEmbedding: number[], ambangKemiripan = 0.5, batas = 5): Promise<PotonganPencarian[]> {
    const hasil: PotonganPencarian[] = [];

    for (const m of this.materiMap.values()) {
      // Pastikan materi tidak aktif diabaikan
      if (m.status !== 'aktif') continue;

      if (!m.potongan) continue;
      for (const p of m.potongan) {
        const skor = p.embedding && queryEmbedding.length ? cosineSimilarity(p.embedding, queryEmbedding) : 1.0;
        if (skor >= ambangKemiripan) {
          hasil.push({
            id: p.id,
            materiId: m.id,
            teks: p.teks,
            judul: m.judul,
            rujukanSumber: m.rujukanSumber,
            skor,
          });
        }
      }
    }

    hasil.sort((a, b) => b.skor - a.skor);
    return hasil.slice(0, batas);
  }

  tambahMateri(item: ItemMateriTiruan) {
    this.materiMap.set(item.id, { ...item });
  }

  hapusSemua() {
    this.materiMap.clear();
    this.pembaruanMap.clear();
  }
}
