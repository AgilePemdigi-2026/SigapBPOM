-- Perbaikan T-F3.1-02 dan T-F2.1-02 dari temuan advisor Supabase, plus kontrak status materi
-- yang dipakai T-F2.3-02 dan T-F1.3-02.

-- Petugas: tanpa RLS, anon bisa membaca dan mengubah penguncian akun (NFR-11) dan hak ekspor.
-- Penguncian diubah dari server dengan service_role (T-F3.2-02), jadi browser hanya boleh membaca dirinya.
alter table public.petugas enable row level security;
revoke all on public.petugas from anon;
revoke insert, update, delete, truncate on public.petugas from authenticated;
create policy "Petugas membaca datanya sendiri" on public.petugas
  for select to authenticated using ((select auth.uid()) = id);

-- search_path dikunci agar fungsi SECURITY DEFINER tidak bisa dibelokkan ke objek palsu.
create or replace function public.is_petugas()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.petugas where id = (select auth.uid()));
$$;
revoke execute on function public.is_petugas() from public, anon;
grant execute on function public.is_petugas() to authenticated;

-- Status materi tipe tertutup (PROJECT_RULES 4.2). Materi tidak aktif tetap disimpan (BR-5).
create type public.status_materi as enum ('aktif', 'tidak_aktif');

update public.materi_pengetahuan set status = 'aktif' where status is null;
update public.materi_pengetahuan set terindeks = false where terindeks is null;
update public.materi_pengetahuan set diperbarui_pada = now() where diperbarui_pada is null;

alter table public.materi_pengetahuan
  alter column status type public.status_materi using status::public.status_materi,
  alter column status set default 'aktif',
  alter column status set not null,
  alter column terindeks set not null,
  alter column diperbarui_pada set not null;

alter table public.materi_potongan alter column materi_id set not null;

create index materi_potongan_materi_id_idx on public.materi_potongan (materi_id);
create index materi_pengetahuan_diperbarui_oleh_idx on public.materi_pengetahuan (diperbarui_oleh);

-- Materi hanya untuk petugas: anon tidak punya grant sama sekali, dan tidak ada DELETE (BR-5).
revoke all on public.materi_pengetahuan, public.materi_potongan from anon;
revoke delete, truncate on public.materi_pengetahuan, public.materi_potongan from authenticated;

drop policy "Petugas bisa baca materi" on public.materi_pengetahuan;
drop policy "Petugas bisa tambah materi" on public.materi_pengetahuan;
drop policy "Petugas bisa perbarui materi" on public.materi_pengetahuan;
drop policy "Petugas bisa baca potongan" on public.materi_potongan;
drop policy "Petugas bisa tambah potongan" on public.materi_potongan;
drop policy "Petugas bisa perbarui potongan" on public.materi_potongan;

create policy "Petugas membaca materi" on public.materi_pengetahuan
  for select to authenticated using ((select public.is_petugas()));
create policy "Petugas menambah materi" on public.materi_pengetahuan
  for insert to authenticated with check ((select public.is_petugas()));
create policy "Petugas memperbarui materi" on public.materi_pengetahuan
  for update to authenticated using ((select public.is_petugas())) with check ((select public.is_petugas()));

create policy "Petugas membaca potongan" on public.materi_potongan
  for select to authenticated using ((select public.is_petugas()));
create policy "Petugas menambah potongan" on public.materi_potongan
  for insert to authenticated with check ((select public.is_petugas()));
create policy "Petugas memperbarui potongan" on public.materi_potongan
  for update to authenticated using ((select public.is_petugas())) with check ((select public.is_petugas()));
