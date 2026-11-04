// Boundary UC-03 Melakukan Login Dashboard: POST { email, password } dengan header x-sigap-kunci
// -> { status, message, data: { sesi, petugas } }. 401 membawa pesan kamus UC-03, 503 bila Supabase Auth bermasalah.
// Satu-satunya pemanggil adalah server dashboard (Astro), bukan browser, jadi tidak ada CORS. Batas laju per IP ada di
// /api/login (PROJECT_RULES 5.2), karena semua login sampai ke sini dari IP server dashboard yang sama.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { layani } from "../_shared/boundary/http.ts";
import { AutentikasiEdgeController, type PenyimpananPetugas } from "../_shared/control/AutentikasiController.ts";
import { ErrorSigap } from "../_shared/control/InformasiProdukController.ts";

// 1. ENTITY LAYER (akses data petugas; slot percobaan dipesan atomik lewat RPC)
class PetugasEntity implements PenyimpananPetugas {
  supabase: any;
  constructor(supabase: any) {
    this.supabase = supabase;
  }

  async dapatkanUserByEmail(email: string) {
    const { data, error } = await this.supabase.rpc('cari_petugas_login', { p_email: email });
    if (error) throw error;
    return data?.[0] ? { petugasData: data[0] } : null;
  }

  async reservasiPercobaan(id: string) {
    const { data, error } = await this.supabase.rpc('reservasi_percobaan_login', { p_id: id });
    if (error) throw error;
    return typeof data === 'number' ? data : null;
  }

  async resetGagalLogin(id: string) {
    const { error } = await this.supabase.rpc('reset_gagal_login', { p_id: id });
    if (error) throw error;
  }

  async kembalikanPercobaan(id: string) {
    const { error } = await this.supabase.rpc('kembalikan_percobaan_login', { p_id: id });
    if (error) throw error;
  }
}

// 2. CONTROL LAYER ada di _shared/control/AutentikasiController.ts

// 3. BOUNDARY LAYER
// Saklar rollout: kunci baru diwajibkan setelah secret SIGAP_KUNCI_LOGIN diisi di Supabase. Isi secret itu terakhir,
// setelah server dashboard mengirim kunci yang sama (urutan deploy di supabase/README.md).
layani(async (body) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const tanpaSesi = { auth: { persistSession: false, autoRefreshToken: false } };
  // Dua klien terpisah: setelah signInWithPassword, supabase-js memakai JWT petugas untuk request berikutnya
  // pada klien yang sama, sehingga RPC reset_gagal_login (hanya service_role) akan ditolak (REQ-3.5, NFR-11).
  const supabase = createClient(supabaseUrl, supabaseServiceKey, tanpaSesi);
  const klienMasuk = createClient(supabaseUrl, supabaseAnonKey, tanpaSesi);

  const entity = new PetugasEntity(supabase);
  const autentikator = {
    async masukDenganPassword(email: string, kataSandi: string) {
      const { data, error } = await klienMasuk.auth.signInWithPassword({ email, password: kataSandi });
      return { sesi: data?.session ?? null, galat: error };
    },
  };
  const control = new AutentikasiEdgeController(entity, autentikator);

  const teks = (nilai: unknown) => (typeof nilai === 'string' ? nilai : '');
  const hasil = await control.masuk(teks(body.email), teks(body.password));
  if (!hasil.sukses) throw new ErrorSigap(401, hasil.pesan);
  return { sesi: hasil.sesi, petugas: hasil.petugas };
}, { nama: 'SIGAP_KUNCI_LOGIN', opsional: true });
