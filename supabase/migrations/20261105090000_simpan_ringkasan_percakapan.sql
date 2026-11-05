-- Entity UC-05: ringkasan percakapan buatan AI (T-F6.3-01, REQ-5.2, NFR-20). Voice Gateway menyusun ringkasan setelah
-- panggilan berakhir lalu menyimpannya lewat Edge Function catat-percakapan (aksi `ringkasan`, service_role).
-- Nomor telepon sudah disamarkan gateway dan Edge Function sebelum sampai di sini (NFR-13).

create or replace function public.simpan_ringkasan_percakapan(p_percakapan_id uuid, p_ringkasan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Batas sama dengan PANJANG_MAKS_RINGKASAN di supabase/functions/_shared/control/TranskripController.ts.
  if p_ringkasan is null or btrim(p_ringkasan) = '' or char_length(p_ringkasan) > 500 then
    raise exception 'ringkasan tidak valid' using errcode = '22023';
  end if;

  -- Ringkasan memang ditulis setelah panggilan ditutup, jadi waktu_selesai tidak dibatasi seperti catat_ucapan.
  -- Ringkasan yang sudah ada tidak ditimpa: id panggilan dari klien tidak bisa dipakai ulang untuk mengganti ringkasan lama.
  update public.percakapan set ringkasan = btrim(p_ringkasan)
   where id = p_percakapan_id and ringkasan is null;
  if not found and not exists (select 1 from public.percakapan where id = p_percakapan_id) then
    raise exception 'percakapan % tidak ditemukan', p_percakapan_id using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.simpan_ringkasan_percakapan(uuid, text) from public, anon, authenticated;
grant execute on function public.simpan_ringkasan_percakapan(uuid, text) to service_role;
