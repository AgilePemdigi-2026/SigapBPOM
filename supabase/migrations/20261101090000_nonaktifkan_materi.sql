-- T-F2.3-02 (REQ-7.3, BR-5): menonaktifkan materi lewat sesi petugas.

-- Pengubah dan waktu pemutakhiran diisi dari sesi, bukan dari isian aplikasi, sehingga tidak bisa dipalsukan.
-- Pembaruan tanpa sesi petugas (service role, skrip seed) mempertahankan pengubah sebelumnya.
create or replace function public.catat_pemutakhiran_materi()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.diperbarui_oleh := coalesce(auth.uid(), new.diperbarui_oleh);
  new.diperbarui_pada := now();
  return new;
end;
$$;

create trigger materi_pengetahuan_catat_pemutakhiran
  before update on public.materi_pengetahuan
  for each row execute function public.catat_pemutakhiran_materi();

-- Pencarian RAG di basis data: potongan materi tidak aktif tidak pernah dikembalikan.
create or replace function public.cari_potongan(
  query_embedding vector(1536),
  ambang_kemiripan float default 0.78,
  batas int default 3
)
returns table (id uuid, materi_id uuid, teks text, judul text, rujukan_sumber text, skor float)
language sql
stable
set search_path = public, extensions
as $$
  select mp.id, mp.materi_id, mp.teks, mk.judul, mk.rujukan_sumber,
         1 - (mp.embedding <=> query_embedding) as skor
  from public.materi_potongan mp
  join public.materi_pengetahuan mk on mk.id = mp.materi_id
  where mk.status = 'aktif'
    and 1 - (mp.embedding <=> query_embedding) >= ambang_kemiripan
  order by mp.embedding <=> query_embedding
  limit batas;
$$;
