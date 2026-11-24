-- Entity UC-04: pengaturan provider AI (cloud atau lokal) dan hak mengatur provider (T-F5.5-02, REQ-4.5, REQ-4.6).
-- Hanya petugas dengan hak_atur_ai yang boleh mengubah provider, dan pemeriksaannya di server (REQ-4.5).
-- Tabel hanya berisi satu baris pengaturan global.

-- 1. Hak mengatur provider AI pada petugas (default tidak berhak)
alter table public.petugas add column if not exists hak_atur_ai boolean not null default false;

-- Akun uji seed yang punya hak ekspor juga diberi hak atur AI
update public.petugas
set hak_atur_ai = true
where id in (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid
);

-- 2. Tipe tertutup provider AI (PROJECT_RULES 4.2)
create type public.provider_ai as enum ('cloud', 'lokal');

-- 3. Tabel pengaturan satu baris: kolom id boolean dengan check (id) memaksa hanya ada satu baris
create table public.pengaturan_ai (
  id boolean primary key default true check (id),
  provider public.provider_ai not null default 'cloud',
  diubah_oleh uuid references public.petugas (id) on delete set null,
  diubah_pada timestamptz not null default now()
);

insert into public.pengaturan_ai (id, provider) values (true, 'cloud');

-- 4. RLS: petugas hanya boleh membaca; perubahan lewat RPC ubah_provider_ai
alter table public.pengaturan_ai enable row level security;

revoke all on table public.pengaturan_ai from anon, authenticated;
grant select on table public.pengaturan_ai to authenticated;
grant all on table public.pengaturan_ai to service_role;

create policy "Petugas membaca pengaturan AI" on public.pengaturan_ai
  for select to authenticated using ((select public.is_petugas()));

-- 5. Pemeriksaan hak atur AI (REQ-4.5)
create or replace function public.boleh_atur_ai()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hak boolean;
begin
  if not public.is_petugas() then
    return false;
  end if;

  select hak_atur_ai into v_hak
  from public.petugas
  where id = (select auth.uid());

  return coalesce(v_hak, false);
end;
$$;

-- 6. RPC ubah provider AI, ditolak 42501 jika pemanggil tidak berhak (REQ-4.5)
create or replace function public.ubah_provider_ai(p_provider public.provider_ai)
returns public.pengaturan_ai
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_baris public.pengaturan_ai;
begin
  if not public.boleh_atur_ai() then
    raise exception 'Akses ditolak: tidak punya hak mengatur provider AI' using errcode = '42501';
  end if;

  if p_provider is null then
    raise exception 'Provider AI wajib diisi' using errcode = '22023';
  end if;

  update public.pengaturan_ai
  set provider = p_provider,
      diubah_oleh = (select auth.uid()),
      diubah_pada = now()
  where id = true
  returning * into v_baris;

  return v_baris;
end;
$$;

-- 7. Pengaturan hak eksekusi
revoke execute on function public.boleh_atur_ai() from public, anon;
grant execute on function public.boleh_atur_ai() to authenticated, service_role;

revoke execute on function public.ubah_provider_ai(public.provider_ai) from public, anon;
grant execute on function public.ubah_provider_ai(public.provider_ai) to authenticated, service_role;
