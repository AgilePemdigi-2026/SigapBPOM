-- Entity UC-02: register pengaduan dan penerbitan tiket pengaduan (T-F4.2-01, REQ-2.3, BR-1).
-- Pengaduan dicatat pada register pengaduan dan diberi nomor tiket ADU dalam satu transaksi.
-- Eksekusi RPC hanya untuk service_role. Anon dan authenticated ditolak.

create table public.pengaduan (
  id uuid primary key default gen_random_uuid(),
  percakapan_id uuid not null unique references public.percakapan (id) on delete cascade,
  tiket_id uuid unique references public.tiket (id) on delete set null,
  nama_produk text,
  nama_produk_diadukan text generated always as (nama_produk) stored,
  kronologi text,
  nama_pelapor text,
  nomor_telepon text check (nomor_telepon is null or nomor_telepon ~ '^08[0-9]{8,11}$' or nomor_telepon = ''),
  kelengkapan boolean not null default true,
  tgl_pengaduan timestamptz not null default now()
);

create index pengaduan_percakapan_id_idx on public.pengaduan (percakapan_id);
create index pengaduan_tiket_id_idx on public.pengaduan (tiket_id);
create index pengaduan_tgl_pengaduan_idx on public.pengaduan (tgl_pengaduan);

alter table public.pengaduan enable row level security;
revoke all on public.pengaduan from anon, authenticated;

-- RPC terbitkan_tiket_pengaduan: catat pengaduan lengkap dan terbitkan tiket ADU (REQ-2.3, BR-1).
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

  -- 1. Catat atau perbarui penelepon
  select penelepon_id into v_penelepon_id from public.percakapan where id = p_percakapan_id;
  if not found then
    raise exception 'percakapan % tidak ditemukan', p_percakapan_id using errcode = 'P0002';
  end if;

  if v_penelepon_id is null then
    insert into public.penelepon (no_telp, nama_pelapor)
    values (p_no_telp, trim(p_nama_pelapor))
    returning id into v_penelepon_id;
  else
    update public.penelepon
       set no_telp = p_no_telp,
           nama_pelapor = trim(p_nama_pelapor)
     where id = v_penelepon_id;
  end if;

  -- 2. Perbarui status percakapan menjadi tiket_terbit dan jenis interaksi pengaduan
  update public.percakapan
     set penelepon_id = v_penelepon_id,
         jenis_interaksi = 'pengaduan',
         status_penyelesaian = 'tiket_terbit'
   where id = p_percakapan_id;

  -- 3. Ambil nomor tiket harian pengaduan secara atomik (ADU-YYYYMMDD-NNNN)
  insert into public.nomor_tiket_harian as n (jenis, tanggal, terakhir)
  values ('pengaduan', v_tanggal, 1)
  on conflict (jenis, tanggal) do update set terakhir = n.terakhir + 1
  returning terakhir into v_urut;

  v_no_tiket := 'ADU-' || to_char(v_tanggal, 'YYYYMMDD') || '-' || lpad(v_urut::text, 4, '0');

  -- 4. Buat baris tiket berstatus belum_ditelaah
  insert into public.tiket (no_tiket, jenis, percakapan_id, ringkasan, status)
  values (v_no_tiket, 'pengaduan', p_percakapan_id, coalesce(p_ringkasan, trim(p_kronologi)), 'belum_ditelaah')
  returning id into v_tiket_id;

  -- 5. Catat pengaduan lengkap ke register pengaduan
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
