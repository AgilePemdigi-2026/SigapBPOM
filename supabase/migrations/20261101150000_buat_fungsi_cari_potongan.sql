-- Fungsi SQL cari_potongan untuk pencarian vektor basis pengetahuan (T-F1.3-02, REQ-1.4).
-- Hanya mengembalikan potongan dari materi berstatus 'aktif' dengan skor kemiripan kosinus >= ambang.
-- Hasil di bawah ambang kemiripan tidak dikembalikan (menghasilkan tabel kosong).

create or replace function public.cari_potongan(
  embedding public.vector,
  ambang float default 0.7,
  batas int default 5
)
returns table (
  id uuid,
  materi_id uuid,
  teks text,
  judul text,
  rujukan_sumber text,
  skor float
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.materi_id,
    p.teks,
    m.judul,
    m.rujukan_sumber,
    (1 - (p.embedding OPERATOR(public.<=>) embedding))::double precision as skor
  from public.materi_potongan p
  join public.materi_pengetahuan m on m.id = p.materi_id
  where m.status = 'aktif'
    and (1 - (p.embedding OPERATOR(public.<=>) embedding)) >= ambang
  order by p.embedding OPERATOR(public.<=>) embedding asc
  limit batas;
$$;

revoke execute on function public.cari_potongan(public.vector, float, int) from public, anon;
grant execute on function public.cari_potongan(public.vector, float, int) to authenticated, service_role;
