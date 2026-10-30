// Boundary UC-07: katalog materi_pengetahuan untuk Voice Gateway, agar kutipan CS AI mengikuti Basis Pengetahuan.
// POST { offset?, batas? } -> { status, message, data: { materi: [{ judul, rujukan_sumber, status, isi }] } }
// Hanya kolom yang dipakai pencarian; kunci service_role tetap di Supabase, gateway cukup memegang SIGAP_KUNCI_INTERNAL.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { layani } from '../_shared/boundary/http.ts';

const BATAS_MAKS = 1000;
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const bilangan = (v: unknown, bawaan: number) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : bawaan);

layani(async (body) => {
  const offset = bilangan(body.offset, 0);
  const batas = Math.min(bilangan(body.batas, BATAS_MAKS) || BATAS_MAKS, BATAS_MAKS);
  const { data, error } = await db
    .from('materi_pengetahuan')
    .select('judul, rujukan_sumber, status, isi')
    .order('id')
    .range(offset, offset + batas - 1);
  if (error) throw error;
  return { materi: data };
});
