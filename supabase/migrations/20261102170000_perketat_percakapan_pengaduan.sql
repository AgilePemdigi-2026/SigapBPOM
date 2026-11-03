-- Entity UC-02: perketat RPC pengaduan terhadap id percakapan pilihan klien (T-F4.2-02, T-F4.3-01, REQ-2.3, REQ-2.5).
-- id percakapan datang dari gateway dan bisa dipalsukan. RPC hanya boleh menulis pada percakapan pengaduan yang masih
-- berjalan (belum bertiket, belum ditutup). Selain itu ditolak dengan kode SG409, yang dipetakan Edge Function menjadi 409.
-- RPC juga tidak pernah menimpa penelepon yang sudah ada: nomor dan nama milik penelepon lain tidak boleh berubah.

create or replace function public.terbitkan_tiket_pengaduan(
  p_percakapan_id uuid,
  p_nama_produk text,
  p_kronologi text,
  p_nama_pelapor text,
  p_no_telp text,
  p_ringkasan text default null
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_penelepon_id uuid;
  v_jenis public.jenis_interaksi;
  v_status public.status_penyelesaian;
  v_tiket_id uuid;
  v_pengaduan_id uuid;
  v_tanggal date := (now() at time zone 'Asia/Jakarta')::date;
  v_urut int;
  v_no_tiket text;
begin
  -- Validasi kelengkapan data (BR-1, REQ-2.3)
  if p_nama_produk is null or trim(p_nama_produk) = '' then
    raise exception 'nama produk wajib diisi' using errcode = '22023';
  end if;
  if p_kronologi is null or trim(p_kronologi) = '' then
    raise exception 'kronologi wajib diisi' using errcode = '22023';
  end if;
  if p_nama_pelapor is null or trim(p_nama_pelapor) = '' then
    raise exception 'nama pelapor wajib diisi' using errcode = '22023';
  end if;
  if p_no_telp is null or trim(p_no_telp) = '' or p_no_telp !~ '^08[0-9]{8,11}$' then
    raise exception 'nomor telepon tidak valid' using errcode = '22023';
  end if;

  -- Kunci baris percakapan agar dua permintaan bersamaan tidak sama-sama lolos pemeriksaan status.
  select penelepon_id, jenis_interaksi, status_penyelesaian
    into v_penelepon_id, v_jenis, v_status
    from public.percakapan where id = p_percakapan_id for update;
  if not found then
    raise exception 'percakapan % tidak ditemukan', p_percakapan_id using errcode = 'P0002';
  end if;
  if v_jenis is distinct from 'pengaduan' or v_status <> 'berjalan' then
    raise exception 'percakapan tidak dapat diubah' using errcode = 'SG409';
  end if;

  -- Penelepon baru hanya dibuat bila percakapan belum punya; penelepon yang ada tidak diubah.
  -- Data pelapor lengkap tetap tersimpan pada register pengaduan.
  if v_penelepon_id is null then
    insert into public.penelepon (no_telp, nama_pelapor)
    values (p_no_telp, trim(p_nama_pelapor))
    returning id into v_penelepon_id;
  end if;

  update public.percakapan
     set penelepon_id = v_penelepon_id,
         jenis_interaksi = 'pengaduan',
         status_penyelesaian = 'tiket_terbit'
   where id = p_percakapan_id;

  insert into public.nomor_tiket_harian as n (jenis, tanggal, terakhir)
  values ('pengaduan', v_tanggal, 1)
  on conflict (jenis, tanggal) do update set terakhir = n.terakhir + 1
  returning terakhir into v_urut;

  v_no_tiket := 'ADU-' || to_char(v_tanggal, 'YYYYMMDD') || '-' || lpad(v_urut::text, 4, '0');

  insert into public.tiket (no_tiket, jenis, percakapan_id, ringkasan, status)
  values (v_no_tiket, 'pengaduan', p_percakapan_id, coalesce(p_ringkasan, trim(p_kronologi)), 'belum_ditelaah')
  returning id into v_tiket_id;

  insert into public.pengaduan (
    percakapan_id, tiket_id, nama_produk, kronologi, nama_pelapor, nomor_telepon, kelengkapan
  ) values (
    p_percakapan_id, v_tiket_id, trim(p_nama_produk), trim(p_kronologi), trim(p_nama_pelapor), p_no_telp, true
  )
  on conflict (percakapan_id) do update set
    tiket_id = excluded.tiket_id,
    nama_produk = excluded.nama_produk,
    kronologi = excluded.kronologi,
    nama_pelapor = excluded.nama_pelapor,
    nomor_telepon = excluded.nomor_telepon,
    kelengkapan = true,
    tgl_pengaduan = now()
  returning id into v_pengaduan_id;

  return v_no_tiket;
end;
$$;

revoke execute on function public.terbitkan_tiket_pengaduan(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.terbitkan_tiket_pengaduan(uuid, text, text, text, text, text) to service_role;

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
  v_jenis public.jenis_interaksi;
  v_status public.status_penyelesaian;
  v_pengaduan_id uuid;
begin
  select penelepon_id, jenis_interaksi, status_penyelesaian
    into v_penelepon_id, v_jenis, v_status
    from public.percakapan where id = p_percakapan_id for update;
  if not found then
    raise exception 'percakapan % tidak ditemukan', p_percakapan_id using errcode = 'P0002';
  end if;
  if v_jenis is distinct from 'pengaduan' or v_status <> 'berjalan' then
    raise exception 'percakapan tidak dapat diubah' using errcode = 'SG409';
  end if;

  -- Penelepon baru hanya dibuat bila percakapan belum punya dan nomor valid. Penelepon yang ada tidak pernah ditimpa.
  if v_penelepon_id is null and p_no_telp is not null and trim(p_no_telp) <> '' and p_no_telp ~ '^08[0-9]{8,11}$' then
    insert into public.penelepon (no_telp, nama_pelapor)
    values (p_no_telp, nullif(trim(p_nama_pelapor), ''))
    returning id into v_penelepon_id;
  end if;

  update public.percakapan
     set penelepon_id = v_penelepon_id,
         jenis_interaksi = 'pengaduan',
         status_penyelesaian = 'pengaduan_tidak_lengkap'
   where id = p_percakapan_id;

  insert into public.pengaduan (
    percakapan_id, tiket_id, nama_produk, kronologi, nama_pelapor, nomor_telepon, kelengkapan
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
