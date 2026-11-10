-- Entity UC-05: simpan catatan pemeriksaan pada percakapan (T-F6.2-01, REQ-5.3, REQ-5.4).
-- Petugas menyimpan catatan pemeriksaan pada percakapan terkait saat menelaah transkrip.
-- Catatan kosong ditolak dengan pesan "Catatan pemeriksaan wajib diisi." (REQ-5.4).
-- Hak akses khusus petugas terautentikasi (public.is_petugas() = true).

-- 1. Tabel catatan_pemeriksaan
create table if not exists public.catatan_pemeriksaan (
  id uuid primary key default gen_random_uuid(),
  percakapan_id uuid not null references public.percakapan (id) on delete cascade,
  petugas_id uuid not null references public.petugas (id),
  isi text not null,
  waktu timestamptz not null default now(),
  check (char_length(btrim(isi)) > 0 and char_length(isi) <= 2000)
);

create index if not exists catatan_pemeriksaan_percakapan_id_idx on public.catatan_pemeriksaan (percakapan_id);
create index if not exists catatan_pemeriksaan_petugas_id_idx on public.catatan_pemeriksaan (petugas_id);

-- 2. Keamanan Row Level Security (RLS)
alter table public.catatan_pemeriksaan enable row level security;

-- Cabut semua hak akses dari publik dan anon
revoke all on public.catatan_pemeriksaan from public, anon;

-- authenticated hanya boleh membaca lewat SELECT (insert dilakukan melalui RPC SECURITY DEFINER)
revoke insert, update, delete, truncate on public.catatan_pemeriksaan from authenticated;
grant select on public.catatan_pemeriksaan to authenticated, service_role;

drop policy if exists "Petugas membaca catatan pemeriksaan" on public.catatan_pemeriksaan;
create policy "Petugas membaca catatan pemeriksaan" on public.catatan_pemeriksaan
  for select to authenticated using ((select public.is_petugas()));

-- 3. RPC simpan_catatan_pemeriksaan (REQ-5.3, REQ-5.4)
create or replace function public.simpan_catatan_pemeriksaan(
  p_percakapan_id uuid,
  p_catatan text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_petugas_id uuid;
begin
  -- Otorisasi khusus petugas
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat menyimpan catatan pemeriksaan' using errcode = '42501';
  end if;

  -- Validasi keberadaan percakapan
  if p_percakapan_id is null then
    raise exception 'Percakapan tidak valid' using errcode = '22023';
  end if;

  if not exists (select 1 from public.percakapan where id = p_percakapan_id) then
    raise exception 'Percakapan % tidak ditemukan', p_percakapan_id using errcode = 'P0002';
  end if;

  -- Validasi catatan kosong (REQ-5.4)
  if p_catatan is null or btrim(p_catatan) = '' then
    raise exception 'Catatan pemeriksaan wajib diisi.' using errcode = '22023';
  end if;

  -- Batasan panjang catatan
  if char_length(p_catatan) > 2000 then
    raise exception 'Catatan pemeriksaan melebihi batas maksimal 2000 karakter' using errcode = '22023';
  end if;

  -- Identitas petugas pencatat
  v_petugas_id := auth.uid();
  if v_petugas_id is null then
    raise exception 'Sesi petugas tidak valid' using errcode = '42501';
  end if;

  -- Simpan catatan tanpa mengubah transkrip atau status percakapan
  insert into public.catatan_pemeriksaan (percakapan_id, petugas_id, isi, waktu)
  values (p_percakapan_id, v_petugas_id, btrim(p_catatan), now())
  returning id into v_id;

  return v_id;
end;
$$;

-- 4. RPC ambil_catatan_pemeriksaan: membaca riwayat catatan pemeriksaan untuk satu percakapan
create or replace function public.ambil_catatan_pemeriksaan(p_percakapan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hasil jsonb;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat membaca catatan pemeriksaan' using errcode = '42501';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'percakapan_id', c.percakapan_id,
      'petugas_id', c.petugas_id,
      'petugas_nama', p.nama,
      'isi', c.isi,
      'waktu', c.waktu
    ) order by c.waktu desc
  ) into v_hasil
  from public.catatan_pemeriksaan c
  left join public.petugas p on p.id = c.petugas_id
  where c.percakapan_id = p_percakapan_id;

  return coalesce(v_hasil, '[]'::jsonb);
end;
$$;

revoke execute on function public.simpan_catatan_pemeriksaan(uuid, text) from public, anon;
grant execute on function public.simpan_catatan_pemeriksaan(uuid, text) to authenticated, service_role;

revoke execute on function public.ambil_catatan_pemeriksaan(uuid) from public, anon;
grant execute on function public.ambil_catatan_pemeriksaan(uuid) to authenticated, service_role;
