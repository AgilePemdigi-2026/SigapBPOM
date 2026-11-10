-- UC-03 / REQ-3.4, REQ-3.5, NFR-11: pencarian petugas, slot percobaan login, dan penguncian akun.
begin;
select plan(21);

-- Siapkan petugas uji
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'uji.kunci@pom.go.id');
insert into public.petugas (id, nama) values ('33333333-3333-3333-3333-333333333333', 'Uji Kunci');
-- Akun Auth tanpa baris petugas
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'bukan.petugas@pom.go.id');

-- 1-4. Hak akses: anon dan authenticated ditolak untuk kedua RPC
set local role anon;
select throws_ok(
  $$ select public.reservasi_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid) $$,
  '42501', null,
  'Pengguna anon tidak boleh mengeksekusi reservasi_percobaan_login'
);
select throws_ok(
  $$ select public.reset_gagal_login('33333333-3333-3333-3333-333333333333'::uuid) $$,
  '42501', null,
  'Pengguna anon tidak boleh mengeksekusi reset_gagal_login'
);
set local role authenticated;
select throws_ok(
  $$ select public.reservasi_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid) $$,
  '42501', null,
  'Pengguna authenticated tidak boleh mengeksekusi reservasi_percobaan_login'
);
select throws_ok(
  $$ select public.reset_gagal_login('33333333-3333-3333-3333-333333333333'::uuid) $$,
  '42501', null,
  'Pengguna authenticated tidak boleh mengeksekusi reset_gagal_login'
);

reset role;
set local role service_role;

-- 5-9. Tiga slot berurutan, slot ketiga memasang kunci, slot keempat ditolak
select is(public.reservasi_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid), 1, 'Reservasi pertama bernomor 1');
select is(public.reservasi_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid), 2, 'Reservasi kedua bernomor 2');
select is(public.reservasi_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid), 3, 'Reservasi ketiga bernomor 3');
select is(
  public.reservasi_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid), null,
  'Reservasi keempat ditolak selama akun terkunci'
);

reset role;
select ok(
  (select terkunci_sampai > now() from public.petugas where id = '33333333-3333-3333-3333-333333333333'),
  'Reservasi ketiga memasang kunci'
);

-- 10-11. Setelah kunci habis, hitungan mulai lagi dari 1 dan akun tidak terkunci
update public.petugas set terkunci_sampai = now() - interval '1 second'
where id = '33333333-3333-3333-3333-333333333333';
set local role service_role;
select is(public.reservasi_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid), 1, 'Setelah kunci habis hitungan mulai dari 1');
reset role;
select is(
  (select terkunci_sampai from public.petugas where id = '33333333-3333-3333-3333-333333333333'), null,
  'Setelah kunci habis satu percobaan tidak langsung mengunci lagi'
);

-- 12. Password benar pada slot ketiga melepas kunci yang dipasang reservasi
set local role service_role;
do $$
begin
  perform public.reservasi_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid);
  perform public.reservasi_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid);
  perform public.reset_gagal_login('33333333-3333-3333-3333-333333333333'::uuid);
end
$$;
reset role;
select is(
  (select (gagal_login, terkunci_sampai)::text from public.petugas where id = '33333333-3333-3333-3333-333333333333'),
  '(0,)',
  'Reset mengosongkan penghitung dan kunci'
);

-- 13. Kunci yang dilepas manual tanpa mereset penghitung tidak membuat akun macet
update public.petugas set gagal_login = 3, terkunci_sampai = null
where id = '33333333-3333-3333-3333-333333333333';
set local role service_role;
select is(public.reservasi_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid), 1, 'Penghitung tanpa kunci mulai lagi dari 1');

-- 14-17. Hak akses: anon dan authenticated ditolak untuk RPC pencarian dan pengembalian slot
reset role;
set local role anon;
select throws_ok(
  $$ select public.cari_petugas_login('uji.kunci@pom.go.id') $$,
  '42501', null,
  'Pengguna anon tidak boleh mengeksekusi cari_petugas_login'
);
select throws_ok(
  $$ select public.kembalikan_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid) $$,
  '42501', null,
  'Pengguna anon tidak boleh mengeksekusi kembalikan_percobaan_login'
);
reset role;
set local role authenticated;
select throws_ok(
  $$ select public.cari_petugas_login('uji.kunci@pom.go.id') $$,
  '42501', null,
  'Pengguna authenticated tidak boleh mengeksekusi cari_petugas_login'
);
select throws_ok(
  $$ select public.kembalikan_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid) $$,
  '42501', null,
  'Pengguna authenticated tidak boleh mengeksekusi kembalikan_percobaan_login'
);

-- 18-19. REQ-3.4: email dinormalkan sebelum dicari; akun Auth yang bukan petugas tidak ditemukan
reset role;
set local role service_role;
select is(
  (select id from public.cari_petugas_login('  UJI.KUNCI@POM.GO.ID ')),
  '33333333-3333-3333-3333-333333333333'::uuid,
  'Email huruf besar dan berspasi menemukan petugasnya'
);
select is_empty(
  $$ select * from public.cari_petugas_login('bukan.petugas@pom.go.id') $$,
  'Akun Auth tanpa baris petugas tidak ditemukan'
);

-- 20. Slot galat teknis pada percobaan ketiga dikembalikan: penghitung turun dan kunci dilepas
reset role;
update public.petugas set gagal_login = 0, terkunci_sampai = null
where id = '33333333-3333-3333-3333-333333333333';
set local role service_role;
do $$
begin
  perform public.reservasi_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid);
  perform public.reservasi_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid);
  perform public.reservasi_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid);
  perform public.kembalikan_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid);
end
$$;
reset role;
select is(
  (select (gagal_login, terkunci_sampai)::text from public.petugas where id = '33333333-3333-3333-3333-333333333333'),
  '(2,)',
  'Pengembalian slot menurunkan penghitung dan melepas kunci'
);

-- 21. Penghitung tidak turun di bawah nol
update public.petugas set gagal_login = 0 where id = '33333333-3333-3333-3333-333333333333';
set local role service_role;
select public.kembalikan_percobaan_login('33333333-3333-3333-3333-333333333333'::uuid);
reset role;
select is(
  (select gagal_login from public.petugas where id = '33333333-3333-3333-3333-333333333333'), 0,
  'Pengembalian pada penghitung nol tetap nol'
);

select * from finish();
rollback;
