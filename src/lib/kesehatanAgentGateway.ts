// Adapter produksi PemeriksaKesehatanAgent: membaca endpoint health Voice Gateway (T-F5.4-01).
// Respons yang diharapkan: { status, message, data: { komponen: [{ nama, sehat, latensiMs }] } } (PROJECT_RULES 4.4).
import type { KomponenTersimpan, PemeriksaKesehatanAgent } from './PemantauanLayananController.ts';

// Halaman pantau tidak boleh ikut macet saat gateway tidak menjawab.
const BATAS_TUNGGU_MS = 3000;

export class PemeriksaKesehatanGateway implements PemeriksaKesehatanAgent {
  url: string;
  fetch: typeof fetch;

  constructor(opsi: { url: string; fetch?: typeof fetch }) {
    this.url = opsi.url.replace(/\/+$/, '');
    this.fetch = opsi.fetch ?? globalThis.fetch;
  }

  async periksa(): Promise<KomponenTersimpan[]> {
    const res = await this.fetch(`${this.url}/health`, { signal: AbortSignal.timeout(BATAS_TUNGGU_MS) });
    if (!res.ok) throw new Error(`gateway health ${res.status}`);
    const body = (await res.json()) as { data?: { komponen?: unknown } };
    const komponen = Array.isArray(body.data?.komponen) ? body.data.komponen : [];
    return komponen.flatMap((k): KomponenTersimpan[] =>
      k && typeof k.nama === 'string'
        ? [{ nama: k.nama, sehat: k.sehat === true, latensiMs: Number.isFinite(k.latensiMs) ? Number(k.latensiMs) : null }]
        : [],
    );
  }
}
