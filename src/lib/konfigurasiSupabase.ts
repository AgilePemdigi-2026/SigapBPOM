// Konfigurasi Supabase untuk server Astro, dibaca dari environment variable (PROJECT_RULES 4.5).
// Hanya kunci anon: service_role tidak pernah dipakai oleh dashboard.
export type KonfigurasiSupabase = { url: string; kunciAnon: string };

export function bacaKonfigurasiSupabase(env: Record<string, string | undefined> = process.env): KonfigurasiSupabase | null {
  const url = (env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const kunciAnon = (env.SUPABASE_ANON_KEY || '').trim();
  return url && kunciAnon ? { url, kunciAnon } : null;
}
