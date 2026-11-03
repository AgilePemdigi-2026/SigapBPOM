// Penyusun control UC-04 untuk halaman dan endpoint dashboard.
// Dengan sesi Supabase, data pemantauan dibaca memakai token petugas agar RLS is_petugas() berlaku. Tanpa token
// (sesi tiruan untuk pengembangan lokal), dipakai penyimpanan tiruan. PemeriksaKesehatanGateway aktif bila
// VOICE_GATEWAY_URL diisi.
import { PemantauanLayananController, type PemeriksaKesehatanAgent, type PenyimpananPemantauan } from './PemantauanLayananController.ts';
import { PemeriksaKesehatanTiruan, PenyimpananPemantauanTiruan } from './mock/pemantauanTiruan.ts';
import { PemeriksaKesehatanGateway } from './kesehatanAgentGateway.ts';
import { PenyimpananPemantauanSupabase } from './penyimpananPemantauanSupabase.ts';
import { bacaKonfigurasiSupabase } from './konfigurasiSupabase.ts';

// Kesehatan tiruan hanya untuk pengembangan lokal. Build produksi tanpa VOICE_GATEWAY_URL tidak punya pemeriksa, sehingga
// semua komponen tampil Gangguan tanpa latensi, bukan angka karangan.
export function pilihKesehatan(env: Record<string, string | undefined> = process.env, produksi: boolean = import.meta.env.PROD): PemeriksaKesehatanAgent | undefined {
  if (env.VOICE_GATEWAY_URL) return new PemeriksaKesehatanGateway({ url: env.VOICE_GATEWAY_URL });
  return produksi ? undefined : new PemeriksaKesehatanTiruan();
}

// Satu instance tiruan per proses agar waktu mulai panggilan tidak bergeser setiap kali halaman di-polling.
const tiruan = new PenyimpananPemantauanTiruan();

export function pilihPenyimpanan(tokenAkses: string | undefined, env: Record<string, string | undefined> = process.env): PenyimpananPemantauan {
  const konfigurasi = bacaKonfigurasiSupabase(env);
  return konfigurasi && tokenAkses
    ? new PenyimpananPemantauanSupabase({ url: konfigurasi.url, kunciPublik: konfigurasi.kunciAnon, tokenAkses })
    : tiruan;
}

export const pemantauanLayanan = (tokenAkses: string | undefined) => new PemantauanLayananController(pilihPenyimpanan(tokenAkses), pilihKesehatan());
