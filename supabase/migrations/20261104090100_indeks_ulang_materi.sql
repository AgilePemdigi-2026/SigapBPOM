-- T-F2.2-02 (REQ-7.1, REQ-7.4): indeks ulang materi ke materi_potongan (scripts/indeks-materi.ts).

-- Urutan potongan dalam materinya (model data PRD), agar bagian dokumen terindeks tampil dari awal dokumen.
alter table public.materi_potongan add column if not exists urutan int not null default 0;

-- Menandai materi terindeks bukan pemutakhiran isi: tanggal dan pengubah tetap, sehingga indeks ulang tidak
-- menimpa tanggal Pemutakhiran seluruh materi. Perubahan lain tetap dicatat seperti 20261101090000.
create or replace function public.catat_pemutakhiran_materi()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'terindeks') = (to_jsonb(old) - 'terindeks') then
    return new;
  end if;
  new.diperbarui_oleh := coalesce(auth.uid(), new.diperbarui_oleh);
  new.diperbarui_pada := now();
  return new;
end;
$$;
