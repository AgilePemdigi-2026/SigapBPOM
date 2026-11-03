import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 1. ENTITY LAYER
class PetugasEntity {
  constructor(private supabase: any) {}

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

  async perbaruiGagalLogin(id: string, jumlahGagal: number, terkunciSampai: string | null) {
    await this.supabase
      .from('petugas')
      .update({ gagal_login: jumlahGagal, terkunci_sampai: terkunciSampai })
      .eq('id', id);
  }
}

// 2. CONTROL LAYER
class AutentikasiEdgeController {
  private DURASI_KUNCI_MENIT = 15;
  
  constructor(private entity: PetugasEntity, private supabase: any) {}

  async masuk(email: string, kataSandi: string) {
    // Validasi isian kosong
    if (!email || !kataSandi) {
      return { sukses: false, pesan: "Login gagal. Semua field harus diisi!" };
    }

    const user = await this.entity.dapatkanUserByEmail(email);
    
    // Validasi kredensial salah (email tidak terdaftar)
    if (!user || !user.petugasData) {
        return { sukses: false, pesan: "Login gagal. Email atau password Anda salah." }; 
    }

    const { petugasData } = user;

    // Cek status kunci (gagal tiga kali)
    if (petugasData.terkunci_sampai) {
      const waktuTerkunci = new Date(petugasData.terkunci_sampai);
      const waktuSekarang = new Date();
      
      if (waktuSekarang < waktuTerkunci) {
        return { sukses: false, pesan: "Akses dikunci sementara. Hubungi administrator." };
      }
    }

    // Lakukan autentikasi
    const { data: authData, error: authError } = await this.supabase.auth.signInWithPassword({
      email: email,
      password: kataSandi,
    });

    // Logika jika kredensial salah (password salah)
    if (authError) {
      const gagalBaru = (petugasData.gagal_login || 0) + 1;
      let waktuKunciBaru = null;

      if (gagalBaru >= 3) {
        const waktuKunci = new Date();
        waktuKunci.setMinutes(waktuKunci.getMinutes() + this.DURASI_KUNCI_MENIT);
        waktuKunciBaru = waktuKunci.toISOString();
      }

      await this.entity.perbaruiGagalLogin(petugasData.id, gagalBaru, waktuKunciBaru);
      return { sukses: false, pesan: "Login gagal. Email atau password Anda salah." }; 
    }

    // Logika jika sukses login
    await this.entity.perbaruiGagalLogin(petugasData.id, 0, null);
    
    return { 
      sukses: true, 
      pesan: "Login berhasil!", 
      sesi: authData.session, 
      petugas: { id: petugasData.id, nama: petugasData.nama } 
    };
  }
}

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
    const control = new AutentikasiEdgeController(entity, supabase);

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