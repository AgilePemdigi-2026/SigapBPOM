// Penyusun control UC-04 untuk halaman dan endpoint dashboard.
// ponytail: penyimpanan tiruan sampai T-F3.1-03 memberi token sesi Supabase dan T-F5.3-01 membuka RLS baca petugas;
// lalu pakai PenyimpananPemantauanSupabase dengan token itu, dan PemeriksaKesehatanGateway bila VOICE_GATEWAY_URL diisi.
import { PemantauanLayananController } from './PemantauanLayananController.ts';
import { PengaduanController } from './PengaduanController.ts';
import { PemeriksaKesehatanTiruan, PenyimpananPemantauanTiruan } from './mock/pemantauanTiruan.ts';
import { PemeriksaKesehatanGateway } from './kesehatanAgentGateway.ts';

const kesehatan = () => (process.env.VOICE_GATEWAY_URL ? new PemeriksaKesehatanGateway({ url: process.env.VOICE_GATEWAY_URL }) : new PemeriksaKesehatanTiruan());

// Satu instance tiruan per proses agar waktu mulai panggilan tidak bergeser setiap kali halaman di-polling.
const tiruan = new PenyimpananPemantauanTiruan();

export const pemantauanLayanan = () => new PemantauanLayananController(tiruan, kesehatan());

export const pengaduan = () => new PengaduanController(tiruan);
