begin;
select plan(7);

-- 1. Pengguna anon ditolak
set local role anon;

select throws_ok(
  $$ select public.ambil_pengaturan_ai() $$,
  '42501',
  null,
  'REQ-4.5: anon tidak boleh memanggil ambil_pengaturan_ai'
);

-- 2. Siapkan pengguna uji
reset role;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000095', 'petugas.pengubah.ai@halobpom.go.id')
on conflict (id) do nothing;

insert into public.petugas (id, nama, hak_atur_ai)
values ('00000000-0000-0000-0000-000000000095', 'Petugas Pengubah AI', true)
on conflict (id) do update set hak_atur_ai = true;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000096', 'petugas.pembaca.ai@halobpom.go.id')
on conflict (id) do nothing;

insert into public.petugas (id, nama, hak_atur_ai)
values ('00000000-0000-0000-0000-000000000096', 'Petugas Pembaca AI', false)
on conflict (id) do update set hak_atur_ai = false;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000079', 'bukan.petugas.baca.ai@example.com')
on conflict (id) do nothing;

-- Pastikan belum ada pengubah
update public.pengaturan_ai set provider = 'cloud', diubah_oleh = null;

-- 3. Pengguna bukan petugas
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000079';

select throws_ok(
  $$ select public.ambil_pengaturan_ai() $$,
  '42501',
  null,
  'REQ-4.5: pengguna bukan petugas ditolak memanggil ambil_pengaturan_ai'
);

-- 4. Petugas tanpa hak membaca sebelum ada pengubah
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000096';

select is(
  (select public.ambil_pengaturan_ai()->>'nama'),
  null,
  'Nama pengubah null bila belum pernah diubah petugas'
);

-- 5. Petugas berhak mengubah provider
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000095';

select is(
  (select (public.ambil_pengaturan_ai()->>'boleh_ubah')::boolean),
  true,
  'boleh_ubah true bagi petugas dengan hak_atur_ai'
);

select is(
  (select (public.ubah_provider_ai('lokal')).provider::text),
  'lokal',
  'Petugas berhak mengubah provider menjadi lokal'
);

-- 6. Petugas lain (tanpa hak) melihat nama pengubah walau RLS petugas menyembunyikan baris itu
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000096';

select is(
  (select public.ambil_pengaturan_ai()->>'nama'),
  'Petugas Pengubah AI',
  'REQ-4.5: petugas lain melihat nama petugas pengubah terakhir'
);

select is(
  (select (public.ambil_pengaturan_ai()->>'boleh_ubah')::boolean),
  false,
  'boleh_ubah false bagi petugas tanpa hak_atur_ai'
);

select * from finish();
rollback;
