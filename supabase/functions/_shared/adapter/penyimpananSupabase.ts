// Adapter penyimpanan ke Postgres Supabase memakai service role (hanya di sisi server).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { ErrorSigap, type LogTool, type PenyimpananLayanan, type PotonganPengetahuan } from '../control/InformasiProdukController.ts';
import type { PenyimpananPengaduan } from '../control/PengaduanController.ts';

export class PenyimpananSupabase implements PenyimpananLayanan, PenyimpananPengaduan {
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

  async cariPotongan(embedding: number[], ambang: number, batas: number): Promise<PotonganPengetahuan[]> {
    const { data, error } = await this.db.rpc('cari_potongan', {
      embedding: JSON.stringify(embedding),
      ambang,
      batas,
    });
    if (error) throw error;
    return (data ?? []).map((b: { teks: string; judul: string; rujukan_sumber: string; skor: number }) => ({
      teks: b.teks,
      judul: b.judul,
      rujukanSumber: b.rujukan_sumber,
      skor: Number(b.skor),
    }));
  }

  async terbitkanTiketPengaduan(data: {
    percakapanId: string;
    namaProduk: string;
    kronologi: string;
    namaPelapor: string;
    nomorTelepon: string;
    ringkasan?: string;
  }) {
    await this.pastikanPercakapan(data.percakapanId);
    const { data: nomorTiket, error } = await this.db.rpc('terbitkan_tiket_pengaduan', {
      p_percakapan_id: data.percakapanId,
      p_nama_produk: data.namaProduk,
      p_kronologi: data.kronologi,
      p_nama_pelapor: data.namaPelapor,
      p_no_telp: data.nomorTelepon,
      p_ringkasan: data.ringkasan ?? null,
    });
    if (error?.code === 'P0002') throw new ErrorSigap(404, 'Percakapan tidak ditemukan.');
    if (error?.code === '23505') {
      // Dua permintaan bersamaan untuk percakapan yang sama: yang kalah mengembalikan nomor tiket milik pemenang.
      const sudahAda = await this.cariTiketPengaduan(data.percakapanId);
      if (sudahAda) return sudahAda;
      throw new ErrorSigap(422, 'Tiket untuk percakapan ini sudah diterbitkan.');
    }
    if (error) throw error;
    return nomorTiket as string;
  }

  async cariTiketPengaduan(percakapanId: string) {
    const { data, error } = await this.db
      .from('tiket')
      .select('no_tiket')
      .eq('percakapan_id', percakapanId)
      .eq('jenis', 'pengaduan')
      .maybeSingle();
    if (error) throw error;
    return (data?.no_tiket as string | undefined) ?? null;
  }

  // Percakapan dibuat saat panggilan dimulai di gateway tanpa menulis ke basis data; baris dibuat di sini bila belum ada.
  async pastikanPercakapan(percakapanId: string) {
    const { error } = await this.db
      .from('percakapan')
      .upsert({ id: percakapanId, jenis_interaksi: 'pengaduan' }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
  }

  async simpanPengaduanTidakLengkap(data: {
    percakapanId: string;
    namaProduk?: string;
    kronologi?: string;
    namaPelapor?: string;
    nomorTelepon?: string;
  }) {
    await this.pastikanPercakapan(data.percakapanId);
    const { data: id, error } = await this.db.rpc('simpan_pengaduan_tidak_lengkap', {
      p_percakapan_id: data.percakapanId,
      p_nama_produk: data.namaProduk ?? null,
      p_kronologi: data.kronologi ?? null,
      p_nama_pelapor: data.namaPelapor ?? null,
      p_no_telp: data.nomorTelepon ?? null,
    });
    if (error?.code === 'P0002') throw new ErrorSigap(404, 'Percakapan tidak ditemukan.');
    if (error) throw error;
    return id as string;
  }
}
