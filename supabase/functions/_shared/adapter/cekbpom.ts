// Adapter cekbpom (PROJECT_RULES 4.3): satu interface, implementasi tiruan dan resmi (T-F1.2-02).
import type { Produk } from '../entity/produk.ts';
import produkTiruan from './produkTiruan.json' with { type: 'json' };

export interface AdapterCekBpom {
  cari(namaProduk: string, signal: AbortSignal): Promise<Produk[]>;
}

/** Dataset contoh selama akses resmi cekbpom.pom.go.id belum tersedia (PRD asumsi). */
export class AdapterCekBpomTiruan implements AdapterCekBpom {
  async cari(namaProduk: string): Promise<Produk[]> {
    const kunci = namaProduk.toLowerCase();
    return (produkTiruan as Produk[]).filter((p) => p.nama.toLowerCase().includes(kunci));
  }
}

/** Kerangka integrasi resmi; diisi setelah akses API cekbpom diberikan BPOM. */
export class AdapterCekBpomResmi implements AdapterCekBpom {
  async cari(): Promise<Produk[]> {
    throw new Error('Akses resmi cekbpom belum tersedia');
  }
}

export function buatAdapterCekBpom(mode: string | undefined): AdapterCekBpom {
  return mode === 'resmi' ? new AdapterCekBpomResmi() : new AdapterCekBpomTiruan();
}
