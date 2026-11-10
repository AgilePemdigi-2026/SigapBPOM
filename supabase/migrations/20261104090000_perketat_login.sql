-- UC-03 / REQ-3.4, REQ-3.5, NFR-11: pencarian petugas untuk Edge Function login dan pengembalian slot percobaan
-- yang gagal karena galat teknis Supabase Auth.

-- Mengganti auth.admin.listUsers(), yang hanya membaca halaman pertama (50 akun). Email dinormalkan karena
-- Supabase Auth menyimpannya dengan huruf kecil. Akun Auth tanpa baris petugas tidak ditemukan.
create or replace function public.cari_petugas_login(p_email text)
returns table (id uuid, nama text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nama
  from auth.users u
  join public.petugas p on p.id = u.id
  where lower(u.email) = lower(trim(p_email));
$$;

-- Galat teknis (rate limit, 5xx, jaringan) bukan percobaan gagal: slot yang dipesan reservasi_percobaan_login
-- dikembalikan. Penghitung lalu di bawah tiga, sehingga kunci yang dipasang slot ketiga ikut dilepas.
create or replace function public.kembalikan_percobaan_login(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.petugas
  set gagal_login = gagal_login - 1,
      terkunci_sampai = null
  where id = p_id
    and gagal_login > 0;
$$;

revoke execute on function public.cari_petugas_login(text) from public, anon, authenticated;
grant execute on function public.cari_petugas_login(text) to service_role;
revoke execute on function public.kembalikan_percobaan_login(uuid) from public, anon, authenticated;
grant execute on function public.kembalikan_percobaan_login(uuid) to service_role;
