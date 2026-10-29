-- Fungsi pencarian RAG: mengembalikan potongan materi aktif yang paling mirip dengan embedding kueri.
-- Materi berstatus tidak aktif (BR-5, REQ-7.3) tidak pernah muncul di hasil pencarian.
CREATE OR REPLACE FUNCTION public.cari_potongan(
  query_embedding vector(1536),
  ambang_kemiripan float DEFAULT 0.78,
  batas int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  materi_id uuid,
  teks text,
  judul text,
  rujukan_sumber text,
  skor float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    mp.id,
    mp.materi_id,
    mp.teks,
    mk.judul,
    mk.rujukan_sumber,
    1 - (mp.embedding <=> query_embedding) AS skor
  FROM public.materi_potongan mp
  JOIN public.materi_pengetahuan mk ON mk.id = mp.materi_id
  WHERE mk.status = 'aktif'
    AND 1 - (mp.embedding <=> query_embedding) >= ambang_kemiripan
  ORDER BY mp.embedding <=> query_embedding
  LIMIT batas;
$$;
