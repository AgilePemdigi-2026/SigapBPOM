-- Buang cari_potongan versi lain sebelum 20261101150000 membuat versi resmi (T-F1.3-02, REQ-1.4).
-- Supabase Cloud sempat menerima migrasi 20261101090000 dari PR yang belum merged, yang membuat
-- cari_potongan(query_embedding, ambang_kemiripan, batas). Postgres menolak `create or replace`
-- yang mengganti nama parameter, jadi 20261101150000 gagal di sana dan RPC dari
-- penyimpananSupabase.ts (parameter embedding, ambang, batas) tidak cocok.
-- Di basis data yang belum punya fungsi ini (mis. `supabase db reset`), blok ini tidak berbuat apa-apa.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'cari_potongan'
  loop
    execute format('drop function %s', f);
  end loop;
end;
$$;
