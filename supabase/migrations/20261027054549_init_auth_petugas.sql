CREATE TABLE public.petugas (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nama text NOT NULL,
  hak_ekspor boolean DEFAULT false NOT NULL,
  gagal_login integer DEFAULT 0 NOT NULL,
  terkunci_sampai timestamptz
);

CREATE OR REPLACE FUNCTION public.is_petugas()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM public.petugas WHERE id = auth.uid());
$$;