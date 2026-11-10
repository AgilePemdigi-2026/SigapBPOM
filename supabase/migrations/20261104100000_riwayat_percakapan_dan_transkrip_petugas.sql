-- Entity UC-05: buka riwayat percakapan dan transkrip tersamar untuk petugas (T-F6.1-01, REQ-5.1, REQ-5.2, NFR-13).
-- Petugas membaca daftar riwayat percakapan dan transkrip lengkapnya dengan nomor telepon dan nama pelapor tersamar.
-- Akses baca hanya untuk petugas terautentikasi (public.is_petugas() = true). Pengguna anon dan publik ditolak.
-- Hak tulis bawaan Supabase pada view dicabut (pola panggilan_berjalan, kasus_perlu_tindak_lanjut).

-- 1. Fungsi bantuan penyamaran nama (NFR-13, REQ-5.2)
-- Mengubah "Budi Santoso" -> "B*** S******"
create or replace function public.samarkan_nama(p_nama text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_kata text[];
  v_hasil text[] := '{}';
  v_k text;
begin
  if p_nama is null or trim(p_nama) = '' then
    return null;
  end if;
  v_kata := regexp_split_to_array(trim(p_nama), '\s+');
  foreach v_k in array v_kata loop
    if length(v_k) > 1 then
      v_hasil := array_append(v_hasil, left(v_k, 1) || repeat('*', length(v_k) - 1));
    else
      v_hasil := array_append(v_hasil, v_k);
    end if;
  end loop;
  return array_to_string(v_hasil, ' ');
end;
$$;

-- 2. Fungsi bantuan penyamaran nama pelapor di dalam teks ucapan (NFR-13)
create or replace function public.samarkan_nama_di_teks(p_teks text, p_nama text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_teks text := p_teks;
  v_nama_bersih text;
  v_nama_samar text;
  v_kata text[];
  v_k text;
  v_pola text;
begin
  if p_teks is null or p_nama is null or trim(p_nama) = '' then
    return p_teks;
  end if;

  v_nama_bersih := trim(p_nama);
  v_nama_samar := public.samarkan_nama(v_nama_bersih);

  -- Samarkan nama lengkap terlebih dahulu (case-insensitive dengan batas kata)
  v_pola := '(?i)\y' || regexp_replace(v_nama_bersih, '([.*+?^${}()|[\]\\])', '\\\1', 'g') || '\y';
  v_teks := regexp_replace(v_teks, v_pola, v_nama_samar, 'g');

  -- Samarkan setiap kata bagian nama (jika panjang >= 3)
  v_kata := regexp_split_to_array(v_nama_bersih, '\s+');
  foreach v_k in array v_kata loop
    if length(v_k) >= 3 then
      v_pola := '(?i)\y' || regexp_replace(v_k, '([.*+?^${}()|[\]\\])', '\\\1', 'g') || '\y';
      v_teks := regexp_replace(v_teks, v_pola, left(v_k, 1) || repeat('*', length(v_k) - 1), 'g');
    end if;
  end loop;

  return v_teks;
end;
$$;

-- 3. View riwayat_percakapan untuk petugas (REQ-5.1)
-- Memuat waktu mulai, jenis interaksi, ringkasan, status penyelesaian, nomor tiket bila ada, dan nomor tersamar
create or replace view public.riwayat_percakapan
with (security_invoker = false) as
select
  p.id,
  p.id as percakapan_id,
  p.waktu_mulai,
  p.waktu_selesai,
  p.jenis_interaksi,
  p.ringkasan,
  p.status_penyelesaian,
  t.no_tiket,
  coalesce(
    pt.no_telp,
    case
      when pg.nomor_telepon is not null and length(trim(pg.nomor_telepon)) >= 8
        then left(trim(pg.nomor_telepon), 4) || repeat('*', length(trim(pg.nomor_telepon)) - 8) || right(trim(pg.nomor_telepon), 4)
      else null
    end
  ) as no_telp,
  coalesce(
    pt.no_telp,
    case
      when pg.nomor_telepon is not null and length(trim(pg.nomor_telepon)) >= 8
        then left(trim(pg.nomor_telepon), 4) || repeat('*', length(trim(pg.nomor_telepon)) - 8) || right(trim(pg.nomor_telepon), 4)
      else null
    end
  ) as no_telp_tersamar,
  coalesce(
    pt.nama_pelapor,
    case
      when pg.nama_pelapor is not null and length(trim(pg.nama_pelapor)) > 0
        then left(trim(pg.nama_pelapor), 1) || '***'
      else null
    end
  ) as nama_pelapor_tersamar
from public.percakapan p
left join public.tiket t on t.percakapan_id = p.id
left join public.pengaduan pg on pg.percakapan_id = p.id
left join public.penelepon_tersamar pt on pt.id = p.penelepon_id
where (select public.is_petugas())
order by p.waktu_mulai desc;

-- 4. View ringkasan_periode_percakapan untuk kartu statistik di atas daftar (REQ-5.1)
create or replace view public.ringkasan_periode_percakapan
with (security_invoker = false) as
select
  count(*)::int as total_percakapan,
  count(*) filter (where p.jenis_interaksi = 'informasi_produk')::int as informasi_produk,
  count(*) filter (where p.jenis_interaksi = 'pengaduan')::int as pengaduan_produk,
  count(*) filter (where p.status_penyelesaian = 'dieskalasi')::int as dieskalasi
from public.percakapan p
where (select public.is_petugas());

-- 5. RPC ambil_ringkasan_periode_percakapan dengan filter tanggal (opsional)
create or replace function public.ambil_ringkasan_periode_percakapan(
  p_awal timestamptz default null,
  p_akhir timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hasil jsonb;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat membaca ringkasan percakapan' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_percakapan', count(*)::int,
    'informasi_produk', count(*) filter (where p.jenis_interaksi = 'informasi_produk')::int,
    'pengaduan_produk', count(*) filter (where p.jenis_interaksi = 'pengaduan')::int,
    'dieskalasi', count(*) filter (where p.status_penyelesaian = 'dieskalasi')::int
  ) into v_hasil
  from public.percakapan p
  where (p_awal is null or p.waktu_mulai >= p_awal)
    and (p_akhir is null or p.waktu_mulai <= p_akhir);

  return coalesce(v_hasil, jsonb_build_object(
    'total_percakapan', 0,
    'informasi_produk', 0,
    'pengaduan_produk', 0,
    'dieskalasi', 0
  ));
end;
$$;

-- 6. View ucapan_petugas untuk transkrip percakapan tersamar (REQ-5.2, NFR-13)
create or replace view public.ucapan_petugas
with (security_invoker = false) as
select
  u.id,
  u.percakapan_id,
  u.urutan,
  u.pembicara,
  case
    when coalesce(pg.nama_pelapor, pnl.nama_pelapor) is not null
      then public.samarkan_nama_di_teks(u.teks, coalesce(pg.nama_pelapor, pnl.nama_pelapor))
    else u.teks
  end as teks,
  u.detik_ke
from public.ucapan u
join public.percakapan p on p.id = u.percakapan_id
left join public.pengaduan pg on pg.percakapan_id = u.percakapan_id
left join public.penelepon pnl on pnl.id = p.penelepon_id
where (select public.is_petugas())
order by u.percakapan_id, u.urutan asc;

-- 7. RPC ambil_transkrip_percakapan: membaca transkrip untuk satu percakapan
create or replace function public.ambil_transkrip_percakapan(p_percakapan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hasil jsonb;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat membaca transkrip' using errcode = '42501';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', u.id,
      'urutan', u.urutan,
      'pembicara', u.pembicara,
      'teks', u.teks,
      'detik_ke', u.detik_ke
    ) order by u.urutan asc
  ) into v_hasil
  from public.ucapan_petugas u
  where u.percakapan_id = p_percakapan_id;

  return coalesce(v_hasil, '[]'::jsonb);
end;
$$;

-- 8. Pengaturan Hak Akses (RLS & Grant)
-- Cabut semua hak akses dari publik dan anon
revoke all on public.riwayat_percakapan from anon, public;
revoke all on public.ringkasan_periode_percakapan from anon, public;
revoke all on public.ucapan_petugas from anon, public;
revoke execute on function public.samarkan_nama(text) from anon, public;
revoke execute on function public.samarkan_nama_di_teks(text, text) from anon, public;
revoke execute on function public.ambil_ringkasan_periode_percakapan(timestamptz, timestamptz) from anon, public;
revoke execute on function public.ambil_transkrip_percakapan(uuid) from anon, public;

-- authenticated hanya membaca: cabut hak tulis bawaan Supabase (pola panggilan_berjalan & kasus_perlu_tindak_lanjut)
revoke all on public.riwayat_percakapan from authenticated;
grant select on public.riwayat_percakapan to authenticated, service_role;

revoke all on public.ringkasan_periode_percakapan from authenticated;
grant select on public.ringkasan_periode_percakapan to authenticated, service_role;

revoke all on public.ucapan_petugas from authenticated;
grant select on public.ucapan_petugas to authenticated, service_role;

grant execute on function public.samarkan_nama(text) to authenticated, service_role;
grant execute on function public.samarkan_nama_di_teks(text, text) to authenticated, service_role;
grant execute on function public.ambil_ringkasan_periode_percakapan(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.ambil_transkrip_percakapan(uuid) to authenticated, service_role;
