-- Entity UC-04: baca pengaturan provider AI beserta nama petugas pengubah dan hak ubah pemanggil (T-F5.5-05, REQ-4.5).
-- RLS petugas hanya membuka baris petugas sendiri, sehingga nama pengubah lain tidak terbaca lewat join dari klien.
-- Fungsi ini security definer dan hanya mengembalikan nama, tanpa kolom lain petugas.

create or replace function public.ambil_pengaturan_ai()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hasil json;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang boleh membaca pengaturan AI' using errcode = '42501';
  end if;

  select json_build_object(
    'provider', a.provider,
    'diubah_pada', a.diubah_pada,
    'nama', p.nama,
    'boleh_ubah', public.boleh_atur_ai()
  )
  into v_hasil
  from public.pengaturan_ai a
  left join public.petugas p on p.id = a.diubah_oleh
  where a.id = true;

  return v_hasil;
end;
$$;

revoke execute on function public.ambil_pengaturan_ai() from public, anon;
grant execute on function public.ambil_pengaturan_ai() to authenticated, service_role;
