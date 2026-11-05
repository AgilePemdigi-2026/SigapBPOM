// Adapter produksi PenyimpananPenanganan: memanggil RPC UC-06 (T-F7.1-01 #98, T-F7.2-01 #100) lewat REST dengan token sesi
// petugas, sehingga RLS dan pemeriksaan is_petugas() berlaku. Tidak pernah memakai service_role.
import { GalatPenanganan, type AlasanTolak, type PenyimpananPenanganan, type TindakLanjut } from './PenangananController.ts';
import { LABEL_STATUS_TIKET, type StatusTiket } from './PemantauanLayananController.ts';

// SQLSTATE yang dilempar RPC, mengikuti kode di migrasi yang sudah ada. SGBR2 khusus untuk tutup tiket tanpa tanggapan (BR-2).
// Galat lain, termasuk PGRST202 saat RPC belum dimigrasikan, menjadi galat sistem.
const ALASAN_GALAT = new Map<string, AlasanTolak>([
  ['22023', 'input_tidak_sah'],
  ['42501', 'akses_ditolak'],
  ['P0002', 'tiket_tidak_ada'],
  ['SG409', 'transisi_tidak_sah'],
  ['SGBR2', 'tanpa_tanggapan'],
]);

export class PenyimpananPenangananSupabase implements PenyimpananPenanganan {
  url: string;
  kunciPublik: string;
  tokenAkses: string;
  fetch: typeof fetch;

  constructor(opsi: { url: string; kunciPublik: string; tokenAkses: string; fetch?: typeof fetch }) {
    this.url = opsi.url.replace(/\/+$/, '');
    this.kunciPublik = opsi.kunciPublik;
    this.tokenAkses = opsi.tokenAkses;
    this.fetch = opsi.fetch ?? globalThis.fetch;
  }

  /** RPC mengembalikan status_tiket sesudah aksi; jawaban lain (misalnya RPC void) menjadi null. */
  async rpc(nama: string, argumen: Record<string, string>): Promise<StatusTiket | null> {
    const res = await this.fetch(`${this.url}/rest/v1/rpc/${nama}`, {
      method: 'POST',
      headers: { apikey: this.kunciPublik, Authorization: `Bearer ${this.tokenAkses}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(argumen),
    });
    const isi: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const alasan = ALASAN_GALAT.get((isi as { code?: string } | null)?.code ?? '');
      if (alasan) throw new GalatPenanganan(alasan);
      throw new Error(`Supabase ${res.status} pada rpc/${nama}`);
    }
    return typeof isi === 'string' && Object.hasOwn(LABEL_STATUS_TIKET, isi) ? (isi as StatusTiket) : null;
  }

  simpanTelaah(noTiket: string, tindakLanjut: TindakLanjut, catatan: string) {
    return this.rpc('simpan_telaah', { p_no_tiket: noTiket, p_tindak_lanjut: tindakLanjut, p_catatan: catatan });
  }

  simpanJadwal(noTiket: string, tanggal: string, unit: string) {
    return this.rpc('simpan_jadwal_pemeriksaan', { p_no_tiket: noTiket, p_tanggal: tanggal, p_unit: unit });
  }

  simpanTanggapan(noTiket: string, isi: string) {
    return this.rpc('simpan_tanggapan', { p_no_tiket: noTiket, p_isi: isi });
  }

  tutupTiket(noTiket: string) {
    return this.rpc('tutup_tiket', { p_no_tiket: noTiket });
  }
}
