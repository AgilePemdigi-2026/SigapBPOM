begin;
select plan(12);

-- 1. Pengguna anon ditolak
set local role anon;

select throws_ok(
  $$ select * from public.pengaturan_ai $$,
  '42501',
  null,
  'REQ-4.5: anon tidak boleh membaca pengaturan_ai'
);

select throws_ok(
  $$ select public.ubah_provider_ai('lokal') $$,
  '42501',
  null,
  'REQ-4.5: anon tidak boleh memanggil ubah_provider_ai'
);

-- 2. Siapkan pengguna uji
reset role;

-- Petugas A: punya hak atur AI
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000093', 'petugas.ai@halobpom.go.id')
on conflict (id) do nothing;

insert into public.petugas (id, nama, hak_atur_ai)
values ('00000000-0000-0000-0000-000000000093', 'Petugas Berhak Atur AI', true)
on conflict (id) do update set hak_atur_ai = true;

-- Petugas B: tanpa hak atur AI
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000094', 'petugas.biasa.ai@halobpom.go.id')
on conflict (id) do nothing;

insert into public.petugas (id, nama, hak_atur_ai)
values ('00000000-0000-0000-0000-000000000094', 'Petugas Tanpa Hak Atur AI', false)
on conflict (id) do update set hak_atur_ai = false;

-- Pengguna non-petugas
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000078', 'bukan.petugas.ai@example.com')
on conflict (id) do nothing;

-- 3. Petugas tanpa hak
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000094';

select is(
  (select count(*)::int from public.pengaturan_ai),
  1,
  'Petugas dapat membaca satu baris pengaturan_ai'
);

select throws_ok(
  $$ update public.pengaturan_ai set provider = 'lokal' $$,
  '42501',
  null,
  'REQ-4.5: update langsung pada pengaturan_ai ditolak'
);

select throws_ok(
  $$ select public.ubah_provider_ai('lokal') $$,
  '42501',
  null,
  'REQ-4.5: petugas tanpa hak ditolak memanggil ubah_provider_ai'
);

select is(
  (select public.boleh_atur_ai()),
  false,
  'Petugas tanpa hak terbaca false pada boleh_atur_ai'
);

select is(
  (select provider::text from public.pengaturan_ai),
  'cloud',
  'REQ-4.6: provider tetap cloud setelah percobaan ubah tanpa hak'
);

-- 4. Pengguna bukan petugas
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000078';

select throws_ok(
  $$ select public.ubah_provider_ai('lokal') $$,
  '42501',
  null,
  'REQ-4.5: pengguna bukan petugas ditolak memanggil ubah_provider_ai'
);

-- 5. Petugas berhak
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000093';

select is(
  (select public.boleh_atur_ai()),
  true,
  'Petugas dengan hak terbaca true pada boleh_atur_ai'
);

select is(
  (select (public.ubah_provider_ai('lokal')).provider::text),
  'lokal',
  'REQ-4.5: petugas berhak berhasil mengubah provider menjadi lokal'
);

select is(
  (select diubah_oleh from public.pengaturan_ai),
  '00000000-0000-0000-0000-000000000093'::uuid,
  'diubah_oleh tercatat sebagai pengguna pemanggil'
);

select * from finish();
rollback;
