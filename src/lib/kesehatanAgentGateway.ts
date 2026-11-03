// Adapter produksi PemeriksaKesehatanAgent: membaca GET /voice/kesehatan milik Voice Gateway (T-F5.4-01).
// Respons gateway: { status, message, data: { siap, korpus, katalog } } (PROJECT_RULES 4.4). Gateway sehat bila menjawab,
// dengan latensi diukur dari permintaan ini; Hermes dan STT/TTS dinilai dari `siap` (kunci keduanya terpasang).
// ponytail: Hermes dan STT/TTS dinilai dari konfigurasi, bukan ping langsung; ganti bila gateway melaporkan hasil probe.
import type { KomponenTersimpan, PemeriksaKesehatanAgent } from './PemantauanLayananController.ts';

// Halaman pantau tidak boleh ikut macet saat gateway tidak menjawab.
const BATAS_TUNGGU_MS = 3000;

export class PemeriksaKesehatanGateway implements PemeriksaKesehatanAgent {
  url: string;
  fetch: typeof fetch;
  now: () => number;

  constructor(opsi: { url: string; fetch?: typeof fetch; now?: () => number }) {
    this.url = opsi.url.replace(/\/+$/, '');
    this.fetch = opsi.fetch ?? globalThis.fetch;
    this.now = opsi.now ?? Date.now;
  }

  async periksa(): Promise<KomponenTersimpan[]> {
    const mulai = this.now();
    const res = await this.fetch(`${this.url}/voice/kesehatan`, { signal: AbortSignal.timeout(BATAS_TUNGGU_MS) });
    if (!res.ok) throw new Error(`gateway kesehatan ${res.status}`);
    const latensiMs = this.now() - mulai;
    const body = (await res.json()) as { data?: { siap?: unknown } };
    const siap = body.data?.siap === true;
    return [
      { nama: 'Voice Gateway', sehat: true, latensiMs },
      { nama: 'Hermes', sehat: siap, latensiMs: null },
      { nama: 'STT/TTS', sehat: siap, latensiMs: null },
    ];
  }
}
