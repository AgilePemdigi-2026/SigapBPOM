begin;
select plan(8);

-- 1. Hak akses
set local role anon;
select throws_ok(
  $$ select * from public.beban_panggilan_per_jam $$,
  '42501',
  null,
  'REQ-4.1 pengguna anon tidak boleh membaca view beban_panggilan_per_jam'
);

reset role;
set local role service_role;
select throws_ok(
  $$ select * from public.beban_panggilan_per_jam $$,
  '42501',
  null,
  'REQ-4.1 service_role tidak membaca view beban_panggilan_per_jam'
);

reset role;
select ok(
  not has_table_privilege('authenticated', 'public.beban_panggilan_per_jam', 'INSERT, UPDATE, DELETE, TRUNCATE'),
  'REQ-4.1 petugas tidak boleh menulis lewat view beban_panggilan_per_jam'
);

-- 2. Akun petugas uji, seperti statistik_ringkasan_layanan.test.sql
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000098', 'petugas.beban@halobpom.go.id')
on conflict (id) do nothing;

insert into public.petugas (id, nama)
values ('00000000-0000-0000-0000-000000000098', 'Petugas Beban')
on conflict (id) do nothing;

-- Percakapan uji: empat hari ini dengan status berbeda, satu 40 hari lalu (selalu di luar rentang view).
set local role service_role;
insert into public.percakapan (id, waktu_mulai, status_penyelesaian) values
  ('33333333-0000-0000-0000-000000000001', now(), 'selesai_ai'),
  ('33333333-0000-0000-0000-000000000002', now(), 'dieskalasi'),
  ('33333333-0000-0000-0000-000000000003', now(), 'tiket_terbit'),
  ('33333333-0000-0000-0000-000000000004', now(), 'berjalan'),
  ('33333333-0000-0000-0000-000000000005', now() - interval '40 days', 'selesai_ai');

-- 3. Sebagai petugas: jam hari ini berjumlah sama dengan kartu Statistik Hari Ini
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000098';

select is(
  (select sum(total)::int from public.beban_panggilan_per_jam where jam::date = (now() at time zone 'Asia/Jakarta')::date),
  (select panggilan_hari_ini from public.ringkasan_statistik_layanan),
  'REQ-4.1 jumlah per jam hari ini sama dengan panggilan_hari_ini'
);

select is(
  (select sum(dijawab_ai)::int from public.beban_panggilan_per_jam where jam::date = (now() at time zone 'Asia/Jakarta')::date),
  (select jawaban_otomatis_ai from public.ringkasan_statistik_layanan),
  'REQ-4.1 dijawab_ai hari ini sama dengan jawaban_otomatis_ai'
);

select is(
  (select sum(dieskalasi)::int from public.beban_panggilan_per_jam where jam::date = (now() at time zone 'Asia/Jakarta')::date),
  (select count(*)::int from public.percakapan
   where status_penyelesaian = 'dieskalasi'
     and (waktu_mulai at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date),
  'REQ-4.1 dieskalasi hari ini sama dengan percakapan berstatus dieskalasi hari ini'
);

select is(
  (select count(*)::int from public.beban_panggilan_per_jam
   where jam < least(date_trunc('month', now() at time zone 'Asia/Jakarta'), date_trunc('day', now() at time zone 'Asia/Jakarta') - interval '6 days')),
  0,
  'REQ-4.1 percakapan di luar rentang awal bulan atau tujuh hari terakhir tidak dihitung'
);

-- 4. Pengguna terautentikasi yang bukan petugas
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-0000000000ff';
select is(
  (select count(*)::int from public.beban_panggilan_per_jam),
  0,
  'REQ-4.1 non-petugas tidak melihat baris beban_panggilan_per_jam'
);

select * from finish();
rollback;
