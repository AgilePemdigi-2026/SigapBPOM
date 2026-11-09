// Adapter antrean notifikasi ke Postgres Supabase memakai service role (hanya di sisi server, T-F7.3-01).
// Nomor tujuan dibaca RPC klaim_notifikasi_tertunda dan tidak pernah keluar dari Edge Function.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import type { PenyimpananNotifikasi } from '../control/PenangananController.ts';
import type { HasilNotifikasi, NotifikasiDiklaim } from '../entity/notifikasi.ts';

export class PenyimpananNotifikasiSupabase implements PenyimpananNotifikasi {
  db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  async klaimNotifikasiTertunda(batas: number, batasPercobaan: number): Promise<NotifikasiDiklaim[]> {
    const { data, error } = await this.db.rpc('klaim_notifikasi_tertunda', {
      p_batas: batas,
      p_batas_percobaan: batasPercobaan,
    });
    if (error) throw error;
    return (data ?? []).map((b: { id: string; no_tiket: string; nomor_telepon: string | null }) => ({
      id: b.id,
      noTiket: b.no_tiket,
      nomorTelepon: b.nomor_telepon,
    }));
  }

  async catatHasilNotifikasi(hasil: HasilNotifikasi) {
    const { error } = await this.db.rpc('catat_hasil_notifikasi', {
      p_id: hasil.id,
      p_terkirim: hasil.status === 'terkirim',
      p_isi: hasil.status === 'terkirim' ? hasil.isi : null,
      p_galat: hasil.status === 'gagal' ? hasil.galat : null,
    });
    if (error) throw error;
  }
}
