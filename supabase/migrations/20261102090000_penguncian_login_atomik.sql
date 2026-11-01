-- UC-22 / REQ-3.5, NFR-11: penghitung gagal login dan penguncian akun dilakukan atomik di basis data,
-- agar percobaan paralel tidak bisa melewati batas tiga kali gagal.
-- Ambang (3 kali) dan durasi kunci (15 menit) sama dengan nilai sebelumnya di Edge Function login.

create or replace function public.catat_gagal_login(p_id uuid)
returns table (gagal_login_baru integer, terkunci_sampai_baru timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.petugas p
  set gagal_login = p.gagal_login + 1,
      terkunci_sampai = case
        when p.gagal_login + 1 >= 3 then now() + interval '15 minutes'
        else p.terkunci_sampai
      end
  where p.id = p_id
  returning p.gagal_login, p.terkunci_sampai;
end;
$$;

-- Mereset penghitung hanya bila akun tidak sedang terkunci. Mengembalikan false bila akun
-- terkunci (misalnya kunci dipasang oleh percobaan paralel), sehingga login harus ditolak.
create or replace function public.reset_gagal_login(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.petugas p
  set gagal_login = 0,
      terkunci_sampai = null
  where p.id = p_id
    and (p.terkunci_sampai is null or p.terkunci_sampai <= now())
  returning p.id into v_id;

  return v_id is not null;
end;
$$;

revoke execute on function public.catat_gagal_login(uuid) from public, anon, authenticated;
grant execute on function public.catat_gagal_login(uuid) to service_role;
revoke execute on function public.reset_gagal_login(uuid) from public, anon, authenticated;
grant execute on function public.reset_gagal_login(uuid) to service_role;
