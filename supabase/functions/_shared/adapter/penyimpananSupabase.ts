// Adapter penyimpanan ke Postgres Supabase memakai service role (hanya di sisi server).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { ErrorSigap, type LogTool, type PenyimpananLayanan } from '../control/InformasiProdukController.ts';

export class PenyimpananSupabase implements PenyimpananLayanan {
  db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  async catatLogTool(log: LogTool) {
    const { error } = await this.db.from('log_tool').insert({
      percakapan_id: log.percakapanId,
      nama_tool: log.namaTool,
      durasi_ms: log.durasiMs,
      berhasil: log.berhasil,
    });
    if (error) throw error;
  }

  async terbitkanTiketEskalasi(data: { percakapanId: string; nomorTelepon: string; ringkasan: string }) {
    const { data: nomorTiket, error } = await this.db.rpc('terbitkan_tiket_eskalasi', {
      p_percakapan_id: data.percakapanId,
      p_no_telp: data.nomorTelepon,
      p_ringkasan: data.ringkasan,
    });
    if (error?.code === 'P0002') throw new ErrorSigap(404, 'Percakapan tidak ditemukan.');
    if (error?.code === '23505') throw new ErrorSigap(422, 'Tiket untuk percakapan ini sudah diterbitkan.');
    if (error) throw error;
    return nomorTiket as string;
  }
}
