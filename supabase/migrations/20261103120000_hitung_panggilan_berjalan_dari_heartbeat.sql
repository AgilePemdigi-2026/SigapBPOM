-- UC-04 (T-F5.2-02, REQ-4.1, REQ-4.2): jumlah "panggilan berjalan" di ringkasan dihitung dari view panggilan_berjalan,
-- jadi hanya panggilan yang heartbeat-nya masih segar. Sebelumnya ringkasan menghitung semua status 'berjalan', termasuk
-- panggilan yatim yang belum disapu, sehingga kartu ringkasan bisa berbeda dengan halaman Panggilan Berjalan.
-- Isi selain kolom panggilan_berjalan sama dengan 20261102140000_statistik_ringkasan_layanan.

create or replace view public.ringkasan_statistik_layanan as
select
  (
    select count(*)::int
    from public.percakapan
    where (waktu_mulai at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date
  ) as panggilan_hari_ini,
  (
    select count(*)::int
    from public.percakapan
    where status_penyelesaian = 'selesai_ai'
      and (waktu_mulai at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date
  ) as jawaban_otomatis_ai,
  (
    select count(*)::int
    from public.tiket
    where jenis = 'eskalasi'
      and (tgl_terbit at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date
  ) as tiket_eskalasi_baru,
  (
    select count(*)::int
    from public.tiket
    where jenis = 'pengaduan'
      and status = 'selesai'
  ) as pengaduan_selesai,
  (select count(*)::int from public.panggilan_berjalan) as panggilan_berjalan
where (select public.is_petugas());

create or replace function public.ambil_ringkasan_layanan()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statistik jsonb;
  v_kategori jsonb;
  v_kasus jsonb;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat membaca ringkasan layanan' using errcode = '42501';
  end if;

  select to_jsonb(s) into v_statistik
  from (
    select
      (select count(*)::int from public.percakapan
       where (waktu_mulai at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date) as panggilan_hari_ini,
      (select count(*)::int from public.percakapan
       where status_penyelesaian = 'selesai_ai'
         and (waktu_mulai at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date) as jawaban_otomatis_ai,
      (select count(*)::int from public.tiket
       where jenis = 'eskalasi'
         and (tgl_terbit at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date) as tiket_eskalasi_baru,
      (select count(*)::int from public.tiket
       where jenis = 'pengaduan'
         and status = 'selesai') as pengaduan_selesai,
      (select count(*)::int from public.panggilan_berjalan) as panggilan_berjalan
  ) s;

  select coalesce(jsonb_agg(k), '[]'::jsonb) into v_kategori
  from (
    with data_7_hari as (
      select
        topik as kategori,
        count(*)::int as jumlah
      from public.percakapan
      where (waktu_mulai at time zone 'Asia/Jakarta')::date >= (now() at time zone 'Asia/Jakarta')::date - 6
        and topik is not null
        and trim(topik) <> ''
      group by topik
    ),
    total_data as (
      select coalesce(sum(jumlah), 0)::numeric as total from data_7_hari
    )
    select
      d.kategori,
      d.jumlah,
      case
        when t.total > 0 then round((d.jumlah * 100.0) / t.total, 2)
        else 0.00
      end as persentase
    from data_7_hari d
    cross join total_data t
    order by d.jumlah desc, d.kategori asc
  ) k;

  select coalesce(jsonb_agg(c), '[]'::jsonb) into v_kasus
  from (
    select
      t.id,
      t.no_tiket,
      t.jenis::text as jenis,
      t.ringkasan,
      t.status::text as status,
      t.tgl_terbit,
      t.percakapan_id
    from public.tiket t
    where t.status = 'belum_ditelaah'
    order by t.tgl_terbit desc
  ) c;

  return jsonb_build_object(
    'statistik', v_statistik,
    'kategori', v_kategori,
    'kasus_perlu_tindak_lanjut', v_kasus
  );
end;
$$;

create or replace function public.ambil_statistik_layanan()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res jsonb;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat membaca statistik layanan' using errcode = '42501';
  end if;

  select to_jsonb(s) into v_res
  from (
    select
      (select count(*)::int from public.percakapan
       where (waktu_mulai at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date) as panggilan_hari_ini,
      (select count(*)::int from public.percakapan
       where status_penyelesaian = 'selesai_ai'
         and (waktu_mulai at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date) as jawaban_otomatis_ai,
      (select count(*)::int from public.tiket
       where jenis = 'eskalasi'
         and (tgl_terbit at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date) as tiket_eskalasi_baru,
      (select count(*)::int from public.tiket
       where jenis = 'pengaduan'
         and status = 'selesai') as pengaduan_selesai,
      (select count(*)::int from public.panggilan_berjalan) as panggilan_berjalan
  ) s;

  return v_res;
end;
$$;
