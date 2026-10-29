// Adapter penyimpanan materi dan potongan ke Supabase Postgres.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';
import type { MateriPengetahuan, MateriPotongan } from '../entity/materi.ts';

export interface PenyimpananPengetahuan {
  simpanMateri(materi: Omit<MateriPengetahuan, 'id'>): Promise<MateriPengetahuan>;
  simpanPotongan(potongan: Omit<MateriPotongan, 'id'>[]): Promise<void>;
  perbaruiStatusTerindeks(id: string, terindeks: boolean): Promise<void>;
}

export class PenyimpananPengetahuanSupabase implements PenyimpananPengetahuan {
  db: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.db = client ?? createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );
  }

  async simpanMateri(materi: Omit<MateriPengetahuan, 'id'>): Promise<MateriPengetahuan> {
    const { data, error } = await this.db
      .from('materi_pengetahuan')
      .insert({
        judul: materi.judul,
        kategori: materi.kategori,
        rujukan_sumber: materi.rujukan_sumber,
        isi: materi.isi,
        status: materi.status,
        terindeks: materi.terindeks,
        diperbarui_oleh: materi.diperbarui_oleh,
        diperbarui_pada: materi.diperbarui_pada,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as MateriPengetahuan;
  }

  async simpanPotongan(potongan: Omit<MateriPotongan, 'id'>[]): Promise<void> {
    if (potongan.length === 0) return;
    const baris = potongan.map((p) => ({
      materi_id: p.materi_id,
      teks: p.teks,
      embedding: p.embedding,
    }));
    const { error } = await this.db.from('materi_potongan').insert(baris);
    if (error) throw error;
  }

  async perbaruiStatusTerindeks(id: string, terindeks: boolean): Promise<void> {
    const { error } = await this.db
      .from('materi_pengetahuan')
      .update({ terindeks })
      .eq('id', id);

    if (error) throw error;
  }
}
