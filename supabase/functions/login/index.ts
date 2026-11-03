import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { AutentikasiEdgeController, type PenyimpananPetugas } from "../_shared/control/AutentikasiController.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 1. ENTITY LAYER (akses data petugas; slot percobaan dipesan atomik lewat RPC)
class PetugasEntity implements PenyimpananPetugas {
  supabase: any;
  constructor(supabase: any) {
    this.supabase = supabase;
  }

  async dapatkanUserByEmail(email: string) {
    const { data: { users }, error } = await this.supabase.auth.admin.listUsers();
    if (error) throw error;

    const user = users.find((u: any) => u.email === email);
    if (!user) return null;

    const { data: petugas } = await this.supabase
      .from('petugas')
      .select('*')
      .eq('id', user.id)
      .single();

    return { authUser: user, petugasData: petugas };
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
}

// 2. CONTROL LAYER ada di _shared/control/AutentikasiController.ts

// 3. BOUNDARY LAYER
const balas = (isi: unknown, status: number) =>
  new Response(JSON.stringify(isi), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const body: unknown = await req.json().catch(() => null);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return balas({ sukses: false, pesan: 'Permintaan tidak valid.' }, 400);
  }

  try {
    const { email, password } = body as Record<string, string>;

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

    const hasil = await control.masuk(email, password);
    return balas(hasil, hasil.sukses ? 200 : 401);
  } catch (e) {
    // Detail galat (misalnya pesan PostgREST) hanya untuk log server, tidak dikirim ke pemanggil (PROJECT_RULES 4.4, 5.12).
    // Galat PostgREST berupa objek biasa; kodenya (misalnya PGRST202 bila migrasi belum diterapkan) aman dicatat.
    console.error('galat tak terduga', e instanceof Error ? e.name : (e as { code?: string } | null)?.code ?? 'unknown');
    return balas({ sukses: false, pesan: 'Terjadi kesalahan pada sistem.' }, 500);
  }
});
