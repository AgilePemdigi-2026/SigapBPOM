// Adapter pemantauan panggilan ke Postgres Supabase memakai service role (hanya di sisi server).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import type { PenyimpananPemantauan } from '../control/PemantauanLayananController.ts';

export class PenyimpananPemantauanSupabase implements PenyimpananPemantauan {
  db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  async laporkanPanggilanAktif(data: Parameters<PenyimpananPemantauan['laporkanPanggilanAktif']>[0]) {
    const { error } = await this.db.rpc('laporkan_panggilan_aktif', {
      p_percakapan_id: data.percakapanId,
      p_jenis_interaksi: data.jenisLayanan,
      p_topik: data.topik,
      p_tahap: data.tahap,
    });
    if (error) throw error;
  }

  async akhiriPanggilanAktif(percakapanId: string) {
    const { data, error } = await this.db.rpc('akhiri_panggilan_aktif', { p_percakapan_id: percakapanId });
    if (error) throw error;
    return data === true;
  }
}
