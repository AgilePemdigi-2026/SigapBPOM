CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.materi_pengetahuan (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    judul TEXT NOT NULL,
    kategori TEXT,
    rujukan_sumber TEXT NOT NULL CHECK (trim(rujukan_sumber) <> ''),
    isi TEXT NOT NULL,
    status TEXT,
    terindeks BOOLEAN DEFAULT false,
    diperbarui_oleh UUID REFERENCES public.petugas(id),
    diperbarui_pada TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.materi_potongan (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    materi_id UUID REFERENCES public.materi_pengetahuan(id),
    teks TEXT NOT NULL,
    embedding vector(1536)
);

CREATE INDEX materi_potongan_embedding_idx 
ON public.materi_potongan 
USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.materi_pengetahuan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materi_potongan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Petugas bisa baca materi" ON public.materi_pengetahuan FOR SELECT USING (is_petugas());
CREATE POLICY "Petugas bisa tambah materi" ON public.materi_pengetahuan FOR INSERT WITH CHECK (is_petugas());
CREATE POLICY "Petugas bisa perbarui materi" ON public.materi_pengetahuan FOR UPDATE USING (is_petugas());

CREATE POLICY "Petugas bisa baca potongan" ON public.materi_potongan FOR SELECT USING (is_petugas());
CREATE POLICY "Petugas bisa tambah potongan" ON public.materi_potongan FOR INSERT WITH CHECK (is_petugas());
CREATE POLICY "Petugas bisa perbarui potongan" ON public.materi_potongan FOR UPDATE USING (is_petugas());