-- Entity UC-04: buka akses antrean tiket dan detail pengaduan untuk petugas (T-F5.3-01, REQ-4.3, REQ-4.4, NFR privasi).
-- Petugas membaca antrean tiket dan transkrip/percakapan terkait dengan nomor telepon dan nama tersamar.
-- Akses baca hanya untuk petugas terautentikasi (public.is_petugas() = true). Pengguna anon ditolak.
-- Tidak ada akses tulis/update status tiket di task ini (Sprint 3, UC-06).

-- 1. Kebijakan RLS baca tabel tiket untuk petugas (hanya SELECT)
grant select on public.tiket to authenticated;
drop policy if exists "Petugas membaca tiket" on public.tiket;
create policy "Petugas membaca tiket" on public.tiket
  for select to authenticated using ((select public.is_petugas()));

-- 2. Kebijakan RLS baca tabel percakapan untuk petugas (hanya SELECT)
grant select on public.percakapan to authenticated;
drop policy if exists "Petugas membaca percakapan" on public.percakapan;
create policy "Petugas membaca percakapan" on public.percakapan
  for select to authenticated using ((select public.is_petugas()));

-- 3. Perbarui view penelepon_tersamar agar dijalankan dengan hak owner (security_invoker = false)
-- sehingga petugas dapat membaca data tersamar tanpa membuka tabel mentah public.penelepon (PROJECT_RULES 5.5).
create or replace view public.penelepon_tersamar
with (security_invoker = false) as
select
  id,
  left(nama_pelapor, 1) || '***' as nama_pelapor,
  left(no_telp, 4) || repeat('*', length(no_telp) - 8) || right(no_telp, 4) as no_telp
from public.penelepon
where (select public.is_petugas());

revoke all on public.penelepon_tersamar from anon, public;
grant select on public.penelepon_tersamar to authenticated, service_role;

-- 4. View antrean tiket untuk petugas (diurutkan dari tiket terbaru belum_ditelaah)
create or replace view public.antrean_tiket_petugas as
select
  t.id as tiket_id,
  t.no_tiket,
  t.jenis as jenis_tiket,
  t.ringkasan,
  t.status as status_tiket,
  t.tgl_terbit as waktu_masuk,
  t.percakapan_id,
  pt.no_telp as no_telp_tersamar,
  pt.nama_pelapor as nama_pelapor_tersamar
from public.tiket t
left join public.percakapan p on p.id = t.percakapan_id
left join public.penelepon_tersamar pt on pt.id = p.penelepon_id
where (select public.is_petugas())
order by
  case when t.status = 'belum_ditelaah' then 0 else 1 end,
  t.tgl_terbit desc;

revoke all on public.antrean_tiket_petugas from anon, public;
grant select on public.antrean_tiket_petugas to authenticated, service_role;

-- 5. View detail pengaduan untuk satu tiket (data pengaduan + ringkasan dengan penyamaran data pribadi)
create or replace view public.detail_pengaduan_tiket as
select
  t.id as tiket_id,
  t.no_tiket,
  t.jenis as jenis_tiket,
  t.status as status_tiket,
  t.ringkasan,
  t.tgl_terbit,
  t.percakapan_id,
  pg.id as pengaduan_id,
  pg.nama_produk,
  pg.nama_produk_diadukan,
  pg.kronologi,
  pg.kelengkapan,
  pg.tgl_pengaduan,
  coalesce(
    pt.nama_pelapor,
    case
      when pg.nama_pelapor is not null and length(trim(pg.nama_pelapor)) > 0
        then left(trim(pg.nama_pelapor), 1) || '***'
      else null
    end
  ) as nama_pelapor_tersamar,
  coalesce(
    pt.no_telp,
    case
      when pg.nomor_telepon is not null and length(trim(pg.nomor_telepon)) >= 8
        then left(trim(pg.nomor_telepon), 4) || repeat('*', length(trim(pg.nomor_telepon)) - 8) || right(trim(pg.nomor_telepon), 4)
      else null
    end
  ) as no_telp_tersamar
from public.tiket t
left join public.pengaduan pg on pg.tiket_id = t.id or pg.percakapan_id = t.percakapan_id
left join public.percakapan p on p.id = t.percakapan_id
left join public.penelepon_tersamar pt on pt.id = p.penelepon_id
where (select public.is_petugas());

revoke all on public.detail_pengaduan_tiket from anon, public;
grant select on public.detail_pengaduan_tiket to authenticated, service_role;

-- 6. RPC ambil_detail_pengaduan_tiket: membaca detail kasus untuk satu tiket berdasarkan nomor tiket atau ID
create or replace function public.ambil_detail_pengaduan_tiket(p_no_tiket text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_detail jsonb;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat membaca detail pengaduan' using errcode = '42501';
  end if;

  select to_jsonb(d) into v_detail
  from public.detail_pengaduan_tiket d
  where d.no_tiket = trim(p_no_tiket) or d.tiket_id::text = trim(p_no_tiket);

  if v_detail is null then
    raise exception 'Tiket % tidak ditemukan', p_no_tiket using errcode = 'P0002';
  end if;

  return v_detail;
end;
$$;

revoke execute on function public.ambil_detail_pengaduan_tiket(text) from public, anon;
grant execute on function public.ambil_detail_pengaduan_tiket(text) to authenticated, service_role;
