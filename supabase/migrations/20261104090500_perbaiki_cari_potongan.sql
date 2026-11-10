-- T-F1.3-02 (REQ-1.6, NFR-8): perbaiki pencarian vektor cari_potongan.
-- Di fungsi SQL, nama kolom menang atas nama parameter. Parameter `embedding` sama namanya dengan kolom
-- materi_potongan.embedding, sehingga setiap potongan dibandingkan dengan dirinya sendiri: skor selalu 1, semua
-- potongan lolos ambang, dan urutannya acak. Parameternya kini dirujuk lewat nama fungsi. Signature dan hak akses
-- tidak berubah, jadi pemanggil RPC tidak perlu diubah.

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
    (1 - (p.embedding OPERATOR(public.<=>) cari_potongan.embedding))::double precision as skor
  from public.materi_potongan p
  join public.materi_pengetahuan m on m.id = p.materi_id
  where m.status = 'aktif'
    and (1 - (p.embedding OPERATOR(public.<=>) cari_potongan.embedding)) >= ambang
  order by p.embedding OPERATOR(public.<=>) cari_potongan.embedding asc
  limit batas;
$$;
