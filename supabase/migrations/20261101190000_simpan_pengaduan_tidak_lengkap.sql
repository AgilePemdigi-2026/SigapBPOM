-- Entity UC-02: simpan pengaduan tidak lengkap tanpa nomor tiket (T-F4.3-02, REQ-2.5).
-- Percakapan pengaduan yang berakhir sebelum data lengkap tetap tersimpan tanpa tiket.
-- Eksekusi RPC hanya untuk service_role. Anon dan authenticated ditolak.

create or replace function public.simpan_pengaduan_tidak_lengkap(
  p_percakapan_id uuid,
  p_nama_produk text default null,
  p_kronologi text default null,
  p_nama_pelapor text default null,
  p_no_telp text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_penelepon_id uuid;
  v_pengaduan_id uuid;
begin
  -- 1. Validasi keberadaan percakapan
  select penelepon_id into v_penelepon_id from public.percakapan where id = p_percakapan_id;
  if not found then
    raise exception 'percakapan % tidak ditemukan', p_percakapan_id using errcode = 'P0002';
  end if;

  -- 2. Catat atau perbarui data penelepon bila nomor telepon diberikan dan valid
  if p_no_telp is not null and trim(p_no_telp) <> '' and p_no_telp ~ '^08[0-9]{8,11}$' then
    if v_penelepon_id is null then
      insert into public.penelepon (no_telp, nama_pelapor)
      values (p_no_telp, nullif(trim(p_nama_pelapor), ''))
      returning id into v_penelepon_id;
    else
      update public.penelepon
         set no_telp = p_no_telp,
             nama_pelapor = coalesce(nullif(trim(p_nama_pelapor), ''), nama_pelapor)
       where id = v_penelepon_id;
    end if;
  end if;

  -- 3. Perbarui status percakapan menjadi pengaduan_tidak_lengkap
  update public.percakapan
     set penelepon_id = coalesce(v_penelepon_id, penelepon_id),
         jenis_interaksi = 'pengaduan',
         status_penyelesaian = 'pengaduan_tidak_lengkap'
   where id = p_percakapan_id;

  -- 4. Simpan ke register pengaduan dengan kelengkapan = false dan tiket_id = null
  insert into public.pengaduan (
    percakapan_id,
    tiket_id,
    nama_produk,
    kronologi,
    nama_pelapor,
    nomor_telepon,
    kelengkapan
  ) values (
    p_percakapan_id,
    null,
    nullif(trim(p_nama_produk), ''),
    nullif(trim(p_kronologi), ''),
    nullif(trim(p_nama_pelapor), ''),
    nullif(trim(p_no_telp), ''),
    false
  )
  on conflict (percakapan_id) do update set
    nama_produk = coalesce(nullif(trim(excluded.nama_produk), ''), pengaduan.nama_produk),
    kronologi = coalesce(nullif(trim(excluded.kronologi), ''), pengaduan.kronologi),
    nama_pelapor = coalesce(nullif(trim(excluded.nama_pelapor), ''), pengaduan.nama_pelapor),
    nomor_telepon = coalesce(nullif(trim(excluded.nomor_telepon), ''), pengaduan.nomor_telepon),
    kelengkapan = case when pengaduan.tiket_id is not null then true else false end,
    tgl_pengaduan = now()
  returning id into v_pengaduan_id;

  return v_pengaduan_id;
end;
$$;

revoke execute on function public.simpan_pengaduan_tidak_lengkap(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.simpan_pengaduan_tidak_lengkap(uuid, text, text, text, text) to service_role;
