// Penyusun control UC-04 untuk halaman dan endpoint dashboard.
// Dengan sesi Supabase, data pemantauan dibaca memakai token petugas agar RLS is_petugas() berlaku. Tanpa token
// (sesi tiruan untuk pengembangan lokal), dipakai penyimpanan tiruan. PemeriksaKesehatanGateway aktif bila
// VOICE_GATEWAY_URL diisi.
import { PemantauanLayananController, type PenyimpananPemantauan } from './PemantauanLayananController.ts';
import { PemeriksaKesehatanTiruan, PenyimpananPemantauanTiruan } from './mock/pemantauanTiruan.ts';
import { PemeriksaKesehatanGateway } from './kesehatanAgentGateway.ts';
import { PenyimpananPemantauanSupabase } from './penyimpananPemantauanSupabase.ts';
import { bacaKonfigurasiSupabase } from './konfigurasiSupabase.ts';

const kesehatan = () => (process.env.VOICE_GATEWAY_URL ? new PemeriksaKesehatanGateway({ url: process.env.VOICE_GATEWAY_URL }) : new PemeriksaKesehatanTiruan());

// Satu instance tiruan per proses agar waktu mulai panggilan tidak bergeser setiap kali halaman di-polling.
const tiruan = new PenyimpananPemantauanTiruan();

export function pilihPenyimpanan(tokenAkses: string | undefined, env: Record<string, string | undefined> = process.env): PenyimpananPemantauan {
  const konfigurasi = bacaKonfigurasiSupabase(env);
  return konfigurasi && tokenAkses
    ? new PenyimpananPemantauanSupabase({ url: konfigurasi.url, kunciPublik: konfigurasi.kunciAnon, tokenAkses })
    : tiruan;
}

export const pemantauanLayanan = (tokenAkses: string | undefined) => new PemantauanLayananController(pilihPenyimpanan(tokenAkses), kesehatan());
