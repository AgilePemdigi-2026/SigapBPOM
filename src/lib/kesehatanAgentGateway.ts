// Adapter produksi PemeriksaKesehatanAgent: membaca GET /voice/kesehatan milik Voice Gateway (T-F5.4-01).
// Respons gateway: { status, message, data: { siap, korpus, katalog, hermes, stt, tts, cekbpom } } (PROJECT_RULES 4.4). Gateway sehat
// bila menjawab, dengan latensi diukur dari permintaan ini. Hermes, STT, dan TTS dinilai dari hasil dan latensi panggilan nyata
// terakhir gateway; sebelum ada panggilan sejak gateway mulai (atau gateway lama tanpa field itu) dipakai `siap`, yaitu kunci
// keduanya terpasang. STT/TTS sehat bila keduanya sehat, dengan latensi terbesar yang diketahui. cekbpom dari `cekbpom`, yaitu
// hasil pencarian terakhir gateway.
import type { KomponenTersimpan, PemeriksaKesehatanAgent } from './PemantauanLayananController.ts';

// Halaman pantau tidak boleh ikut macet saat gateway tidak menjawab.
const BATAS_TUNGGU_MS = 3000;

type HasilTerakhir = { sehat?: unknown; latensiMs?: unknown } | null | undefined;

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
    const body = (await res.json()) as {
      data?: {
        siap?: unknown;
        hermes?: HasilTerakhir;
        stt?: HasilTerakhir;
        tts?: HasilTerakhir;
        cekbpom?: { aktif?: unknown; sehat?: unknown; latensiMs?: unknown };
      };
    };
    const siap = body.data?.siap === true;
    const kondisi = (h: HasilTerakhir) =>
      typeof h?.sehat === 'boolean' ? { sehat: h.sehat, latensiMs: Number.isFinite(h.latensiMs) ? Number(h.latensiMs) : null } : { sehat: siap, latensiMs: null };
    const stt = kondisi(body.data?.stt);
    const tts = kondisi(body.data?.tts);
    const latensiSuara = [stt.latensiMs, tts.latensiMs].filter((n): n is number => n !== null);
    const komponen: KomponenTersimpan[] = [
      { nama: 'Voice Gateway', sehat: true, latensiMs },
      { nama: 'Hermes', ...kondisi(body.data?.hermes) },
      { nama: 'STT/TTS', sehat: stt.sehat && tts.sehat, latensiMs: latensiSuara.length ? Math.max(...latensiSuara) : null },
    ];
    // cekbpom: nonaktif berarti cek legalitas tidak tersedia; belum ada pencarian berarti belum bisa dipastikan,
    // jadi tidak dilaporkan dan control memakai log tool.
    const cek = body.data?.cekbpom;
    if (cek?.aktif === false) komponen.push({ nama: 'cekbpom', sehat: false, latensiMs: null });
    else if (cek?.aktif === true && typeof cek.sehat === 'boolean') {
      komponen.push({ nama: 'cekbpom', sehat: cek.sehat, latensiMs: Number.isFinite(cek.latensiMs) ? Number(cek.latensiMs) : null });
    }
    return komponen;
  }
}
