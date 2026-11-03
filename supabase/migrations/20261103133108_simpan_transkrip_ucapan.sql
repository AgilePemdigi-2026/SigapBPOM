-- Entity UC-01: transkrip percakapan tersimpan di register layanan (T-F1.1-03, T-F1.1-05, post-condition UC-01, NFR-20).
-- Voice Gateway menambah ucapan lewat Edge Function catat-percakapan (service_role). Urutan dan detik_ke dihitung di sini,
-- jadi penulis tidak bisa menimpa atau menyisipkan ucapan. Nomor telepon sudah disamarkan Edge Function (NFR-13).
-- log_tool tidak butuh perubahan: service_role sudah boleh menulis, dan kolomnya tidak memuat argumen tool.

create or replace function public.catat_ucapan(p_percakapan_id uuid, p_pembicara public.pembicara, p_teks text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_waktu_mulai timestamptz;
  v_waktu_selesai timestamptz;
  v_urutan int;
begin
  -- Batas sama dengan PANJANG_MAKS_TEKS_UCAPAN di supabase/functions/_shared/control/TranskripController.ts.
  if p_pembicara is null or p_teks is null or btrim(p_teks) = '' or char_length(p_teks) > 2000 then
    raise exception 'ucapan tidak valid' using errcode = '22023';
  end if;

  -- Kunci baris percakapan agar ucapan serentak pada percakapan yang sama tidak mendapat urutan yang sama.
  -- NO KEY UPDATE cukup untuk itu dan tidak menahan pemeriksaan foreign key tabel lain.
  select waktu_mulai, waktu_selesai into v_waktu_mulai, v_waktu_selesai
    from public.percakapan where id = p_percakapan_id for no key update;
  if not found then
    raise exception 'percakapan % tidak ditemukan', p_percakapan_id using errcode = 'P0002';
  end if;
  -- Panggilan yang sudah ditutup tidak ditambah lagi (giliran terlambat, id dipakai ulang). Kiriman yang masih di jalan
  -- saat panggilan diakhiri tetap diterima selama dua menit.
  if v_waktu_selesai < now() - interval '2 minutes' then
    raise exception 'percakapan % sudah berakhir', p_percakapan_id using errcode = '55000';
  end if;

  select coalesce(max(urutan), 0) + 1 into v_urutan from public.ucapan where percakapan_id = p_percakapan_id;

  insert into public.ucapan (percakapan_id, urutan, pembicara, teks, detik_ke)
  values (p_percakapan_id, v_urutan, p_pembicara, p_teks, greatest(0, floor(extract(epoch from now() - v_waktu_mulai)))::int);

  return v_urutan;
end;
$$;

revoke execute on function public.catat_ucapan(uuid, public.pembicara, text) from public, anon, authenticated;
grant execute on function public.catat_ucapan(uuid, public.pembicara, text) to service_role;
