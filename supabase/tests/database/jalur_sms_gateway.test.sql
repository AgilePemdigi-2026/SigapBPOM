-- Jalur SMS Gateway (migrasi 20261115100000): tiket terbit mengantrekan SMS nomor tiket, klaim membawa jenis,
-- dan pemicu pg_cron tidak memanggil apa pun tanpa rahasia Vault.
begin;
select plan(9);

set local role service_role;

insert into public.penelepon (id, no_telp) values ('77777777-0000-0000-0000-000000001151', '081311112222');
insert into public.percakapan (id, penelepon_id, jenis_interaksi, status_penyelesaian)
values ('88888888-0000-0000-0000-000000001151', '77777777-0000-0000-0000-000000001151', 'informasi_produk', 'dieskalasi');
insert into public.tiket (id, no_tiket, jenis, percakapan_id)
values ('99999999-0000-0000-0000-000000001151', 'ESK-20261115-1151', 'eskalasi', '88888888-0000-0000-0000-000000001151');

-- 1. Trigger mengantrekan tepat satu SMS nomor tiket
select is(
  (select count(*)::int from public.notifikasi where tiket_id = '99999999-0000-0000-0000-000000001151' and jenis = 'nomor_tiket'),
  1, 'Tiket baru mengantrekan satu SMS nomor tiket'
);
select is(
  (select status_kirim from public.notifikasi where tiket_id = '99999999-0000-0000-0000-000000001151'),
  'tertunda'::public.status_kirim_notifikasi, 'SMS nomor tiket berstatus tertunda'
);

-- 2. Pemicu tanpa rahasia Vault tidak memanggil Edge Function
reset role;
delete from vault.secrets where name in ('sigap_url_proyek', 'sigap_kunci_internal');
select is(public.picu_kirim_notifikasi(), null::bigint, 'Tanpa rahasia Vault tidak ada permintaan pg_net');
select ok(exists (select 1 from cron.job where jobname = 'kirim-notifikasi-sms' and command like '%picu_kirim_notifikasi%'),
  'pg_cron menjadwalkan pemicu kirim-notifikasi');
select ok(not has_function_privilege('anon', 'public.picu_kirim_notifikasi()', 'execute'), 'anon tidak bisa memicu kirim');
select ok(not has_function_privilege('authenticated', 'public.picu_kirim_notifikasi()', 'execute'), 'authenticated tidak bisa memicu kirim');

-- 3. Klaim membawa jenis dan nomor penelepon tiket eskalasi
set local role service_role;
select results_eq(
  $$ select jenis::text, no_tiket, nomor_telepon from public.klaim_notifikasi_tertunda(100, 5)
     where no_tiket = 'ESK-20261115-1151' $$,
  $$ values ('nomor_tiket'::text, 'ESK-20261115-1151'::text, '081311112222'::text) $$,
  'Klaim mengembalikan jenis nomor_tiket dan nomor penelepon'
);

-- 4. Antrean kosong: pemicu tidak memanggil apa pun walau rahasia ada
reset role;
update public.notifikasi set status_kirim = 'terkirim', tgl_kirim = now() where status_kirim <> 'terkirim';
select vault.create_secret('http://127.0.0.1:54321', 'sigap_url_proyek');
select vault.create_secret('kunci-uji', 'sigap_kunci_internal');
select is(public.picu_kirim_notifikasi(), null::bigint, 'Antrean kosong tidak memicu Edge Function');

-- 5. Ada antrean dan rahasia: satu permintaan pg_net dibuat
update public.notifikasi set status_kirim = 'tertunda', tgl_kirim = null
 where tiket_id = '99999999-0000-0000-0000-000000001151';
select isnt(public.picu_kirim_notifikasi(), null::bigint, 'Antrean dan rahasia ada: kirim-notifikasi dipicu');

select * from finish();
rollback;
