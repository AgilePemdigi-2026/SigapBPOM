// Boundary UC-07 (REQ-7.3, BR-5): petugas menonaktifkan materi. Middleware sudah menolak permintaan tanpa sesi.
import type { APIRoute } from 'astro';
import { BasisPengetahuanController } from '../../../../lib/BasisPengetahuanController.ts';
import { PenyimpananMateriTiruan } from '../../../../lib/mock/materiTiruan.ts';
import { PenyimpananMateriSupabase } from '../../../../lib/penyimpananMateriSupabase.ts';
import { bacaKonfigurasiSupabase } from '../../../../lib/konfigurasiSupabase.ts';

// Sama seperti halaman Basis Pengetahuan: dengan sesi Supabase, status diubah memakai token petugas agar RLS
// is_petugas() berlaku. Tanpa token (sesi tiruan untuk pengembangan lokal), dipakai penyimpanan tiruan.
export const POST: APIRoute = async ({ params, locals }) => {
  const konfigurasi = bacaKonfigurasiSupabase();
  const token = locals.tokenAkses;
  const penyimpanan = konfigurasi && token
    ? new PenyimpananMateriSupabase({ url: konfigurasi.url, kunciPublik: konfigurasi.kunciAnon, tokenAkses: token })
    : new PenyimpananMateriTiruan();
  const hasil = await new BasisPengetahuanController(penyimpanan).nonaktifkanMateri(params.id);
  return Response.json({ status: hasil.kode === 200 ? 'success' : 'error', message: hasil.pesan, data: null }, { status: hasil.kode });
};
