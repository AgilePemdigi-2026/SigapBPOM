// Boundary UC-04: provider AI yang dipilih petugas (cloud/lokal), dibaca Voice Gateway untuk memilih jalur percakapan.
// POST {} -> { status, message, data: { provider: 'cloud' | 'lokal' } }
// Kunci service_role tetap di Supabase, gateway cukup memegang SIGAP_KUNCI_INTERNAL.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { layani } from '../_shared/boundary/http.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

layani(async () => {
  const { data, error } = await db.from('pengaturan_ai').select('provider').single();
  if (error) throw error;
  return { provider: data.provider };
});
