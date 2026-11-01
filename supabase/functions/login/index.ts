import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { AutentikasiEdgeController, type PenyimpananPetugas } from "../_shared/control/AutentikasiController.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 1. ENTITY LAYER (akses data petugas; penghitung gagal diubah atomik lewat RPC)
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

  async catatGagalLogin(id: string) {
    const { data, error } = await this.supabase.rpc('catat_gagal_login', { p_id: id });
    if (error) throw error;
    const baris = Array.isArray(data) ? data[0] : data;
    if (!baris) return null;
    return { gagalLogin: baris.gagal_login_baru, terkunciSampai: baris.terkunci_sampai_baru };
  }

  async resetGagalLogin(id: string) {
    const { data, error } = await this.supabase.rpc('reset_gagal_login', { p_id: id });
    if (error) throw error;
    return data === true;
  }
}

// 2. CONTROL LAYER ada di _shared/control/AutentikasiController.ts

// 3. BOUNDARY LAYER
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { email, password } = body;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const entity = new PetugasEntity(supabase);
    const autentikator = {
      async masukDenganPassword(email: string, kataSandi: string) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: kataSandi });
        return { sesi: data?.session ?? null, galat: error };
      },
    };
    const control = new AutentikasiEdgeController(entity, autentikator);

    const hasil = await control.masuk(email, password);

    return new Response(JSON.stringify(hasil), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: hasil.sukses ? 200 : 401,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
