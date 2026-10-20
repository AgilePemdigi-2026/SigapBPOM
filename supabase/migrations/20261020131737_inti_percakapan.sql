-- Entity UC-01/UC-02: tabel inti layanan suara (T-F1.1-03, NFR-20).
-- Penulisan hanya lewat service role (Voice Gateway, Edge Functions). Pembacaan petugas
-- menyusul lewat is_petugas() di T-F3; sampai itu ada, anon dan authenticated ditolak semua.

create type public.jenis_interaksi as enum ('informasi_produk', 'pengaduan');
create type public.status_penyelesaian as enum ('berjalan', 'selesai_ai', 'dieskalasi', 'tiket_terbit', 'pengaduan_tidak_lengkap');
create type public.pembicara as enum ('sistem', 'penelepon');
create type public.jenis_tiket as enum ('pengaduan', 'eskalasi');
create type public.status_tiket as enum ('belum_ditelaah', 'sedang_ditelaah', 'menunggu_pemeriksaan', 'tanggapan_disusun', 'selesai', 'diteruskan');

-- Nomor telepon lengkap hanya dibuka Edge Functions (PROJECT_RULES 5.5).
create table public.penelepon (
  id uuid primary key default gen_random_uuid(),
  no_telp text not null check (no_telp ~ '^08[0-9]{8,11}$'),
  nama_pelapor text,
  nik_pelapor text
);

create table public.percakapan (
  id uuid primary key default gen_random_uuid(),
  penelepon_id uuid references public.penelepon (id),
  waktu_mulai timestamptz not null default now(),
  waktu_selesai timestamptz check (waktu_selesai is null or waktu_selesai >= waktu_mulai),
  jenis_interaksi public.jenis_interaksi,
  status_penyelesaian public.status_penyelesaian not null default 'berjalan',
  tahap_ai text,
  topik text,
  ringkasan text
);
create index percakapan_waktu_mulai_idx on public.percakapan (waktu_mulai);
create index percakapan_status_penyelesaian_idx on public.percakapan (status_penyelesaian);
create index percakapan_penelepon_id_idx on public.percakapan (penelepon_id);

create table public.ucapan (
  id bigint generated always as identity primary key,
  percakapan_id uuid not null references public.percakapan (id) on delete cascade,
  urutan int not null,
  pembicara public.pembicara not null,
  teks text not null,
  detik_ke int not null check (detik_ke >= 0),
  unique (percakapan_id, urutan)
);

-- Satu percakapan memicu paling banyak satu tiket (ERD PRD), sekaligus mencegah tiket ganda saat retry.
create table public.tiket (
  id uuid primary key default gen_random_uuid(),
  no_tiket text not null unique,
  jenis public.jenis_tiket not null,
  percakapan_id uuid not null unique references public.percakapan (id),
  ringkasan text,
  status public.status_tiket not null default 'belum_ditelaah',
  tgl_terbit timestamptz not null default now(),
  check (
    (jenis = 'pengaduan' and no_tiket ~ '^ADU-[0-9]{8}-[0-9]{4}$')
    or (jenis = 'eskalasi' and no_tiket ~ '^ESK-[0-9]{8}-[0-9]{4}$')
  )
);

create table public.log_tool (
  id bigint generated always as identity primary key,
  percakapan_id uuid references public.percakapan (id) on delete cascade,
  nama_tool text not null,
  durasi_ms int not null check (durasi_ms >= 0),
  berhasil boolean not null,
  waktu timestamptz not null default now()
);
create index log_tool_percakapan_id_idx on public.log_tool (percakapan_id);

-- Penghitung nomor tiket per jenis per hari (zona Asia/Jakarta), dinaikkan secara atomik.
create table public.nomor_tiket_harian (
  jenis public.jenis_tiket not null,
  tanggal date not null,
  terakhir int not null,
  primary key (jenis, tanggal)
);

-- View untuk dashboard: nama dan nomor sudah disamarkan di server (PROJECT_RULES 5.5).
create view public.penelepon_tersamar with (security_invoker = true) as
select
  id,
  left(nama_pelapor, 1) || '***' as nama_pelapor,
  left(no_telp, 4) || repeat('*', length(no_telp) - 8) || right(no_telp, 4) as no_telp
from public.penelepon;

alter table public.penelepon enable row level security;
alter table public.percakapan enable row level security;
alter table public.ucapan enable row level security;
alter table public.tiket enable row level security;
alter table public.log_tool enable row level security;
alter table public.nomor_tiket_harian enable row level security;

-- Tanpa kebijakan RLS, anon dan authenticated tidak bisa membaca atau menulis apa pun.
-- Grant dicabut juga sebagai pertahanan berlapis; service_role tetap punya akses penuh.
revoke all on public.penelepon, public.percakapan, public.ucapan, public.tiket,
  public.log_tool, public.nomor_tiket_harian, public.penelepon_tersamar
  from anon, authenticated;

-- Terbitkan tiket dalam satu transaksi: simpan penelepon, tandai percakapan dieskalasi,
-- ambil nomor urut harian, buat tiket (T-F1.4-02, REQ-1.7).
create function public.terbitkan_tiket_eskalasi(p_percakapan_id uuid, p_no_telp text, p_ringkasan text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_penelepon_id uuid;
  v_tanggal date := (now() at time zone 'Asia/Jakarta')::date;
  v_urut int;
  v_no_tiket text;
begin
  insert into public.penelepon (no_telp) values (p_no_telp) returning id into v_penelepon_id;

  update public.percakapan
     set penelepon_id = v_penelepon_id, status_penyelesaian = 'dieskalasi'
   where id = p_percakapan_id;
  if not found then
    raise exception 'percakapan % tidak ditemukan', p_percakapan_id using errcode = 'P0002';
  end if;

  insert into public.nomor_tiket_harian as n (jenis, tanggal, terakhir)
  values ('eskalasi', v_tanggal, 1)
  on conflict (jenis, tanggal) do update set terakhir = n.terakhir + 1
  returning terakhir into v_urut;

  v_no_tiket := 'ESK-' || to_char(v_tanggal, 'YYYYMMDD') || '-' || lpad(v_urut::text, 4, '0');
  insert into public.tiket (no_tiket, jenis, percakapan_id, ringkasan)
  values (v_no_tiket, 'eskalasi', p_percakapan_id, p_ringkasan);

  return v_no_tiket;
end;
$$;

revoke execute on function public.terbitkan_tiket_eskalasi(uuid, text, text) from public, anon, authenticated;
grant execute on function public.terbitkan_tiket_eskalasi(uuid, text, text) to service_role;
