UPDATE public.materi_pengetahuan
SET status = 'aktif'
WHERE status IS NULL;

ALTER TABLE public.materi_pengetahuan
  ALTER COLUMN status SET DEFAULT 'aktif',
  ALTER COLUMN status SET NOT NULL,
  ADD CONSTRAINT materi_pengetahuan_status_check CHECK (status IN ('aktif', 'tidak_aktif'));

CREATE OR REPLACE FUNCTION public.nonaktifkan_materi(p_materi_id uuid, p_petugas_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.petugas WHERE id = p_petugas_id) THEN
    RAISE EXCEPTION 'Petugas tidak valid.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.materi_pengetahuan
     SET status = 'tidak_aktif',
         diperbarui_oleh = p_petugas_id,
         diperbarui_pada = now()
   WHERE id = p_materi_id
     AND status <> 'tidak_aktif';

  IF FOUND THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM public.materi_pengetahuan WHERE id = p_materi_id) THEN
    RETURN false;
  END IF;

  RAISE EXCEPTION 'Materi tidak ditemukan.' USING ERRCODE = 'P0002';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.nonaktifkan_materi(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nonaktifkan_materi(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cari_potongan(embedding vector(1536), ambang double precision, batas integer)
RETURNS TABLE (teks text, judul text, rujukan_sumber text, skor double precision)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT
    mp.teks,
    m.judul,
    m.rujukan_sumber,
    1 - (mp.embedding <=> $1) AS skor
  FROM public.materi_potongan AS mp
  JOIN public.materi_pengetahuan AS m ON m.id = mp.materi_id
  WHERE m.status = 'aktif'
    AND mp.embedding IS NOT NULL
    AND 1 - (mp.embedding <=> $1) >= $2
  ORDER BY mp.embedding <=> $1
  LIMIT greatest($3, 0);
$$;

REVOKE EXECUTE ON FUNCTION public.cari_potongan(vector, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cari_potongan(vector, double precision, integer) TO service_role;