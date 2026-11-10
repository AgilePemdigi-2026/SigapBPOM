-- T-F5.2-02 (REQ-4.2): panggilan aktif tercatat dengan tahap terbaru, hilang setelah berakhir atau heartbeat berhenti.
begin;
select plan(19);

-- 1. Hak akses: anon dan authenticated tidak boleh memanggil RPC; anon dan service_role tidak boleh membaca view
set local role anon;
select throws_ok(
  $$ select public.laporkan_panggilan_aktif('77777777-0000-0000-0000-000000000001'::uuid, null, null, 'mendengar') $$,
  '42501', null, 'anon tidak boleh memanggil laporkan_panggilan_aktif'
);
select throws_ok(
  $$ select * from public.panggilan_berjalan $$,
  '42501', null, 'anon tidak boleh membaca view panggilan_berjalan'
);

reset role;
set local role authenticated;
select throws_ok(
  $$ select public.akhiri_panggilan_aktif('77777777-0000-0000-0000-000000000001'::uuid) $$,
  '42501', null, 'authenticated tidak boleh memanggil akhiri_panggilan_aktif'
);
select is(
  has_table_privilege('authenticated', 'public.panggilan_berjalan', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  false, 'authenticated hanya boleh membaca view panggilan_berjalan'
);

-- service_role bukan petugas: view ditolak dengan jelas, bukan kosong diam-diam
reset role;
set local role service_role;
select throws_ok(
  $$ select * from public.panggilan_berjalan $$,
  '42501', null, 'service_role tidak boleh membaca view panggilan_berjalan'
);

-- 2. Siapkan petugas dan penelepon (data uji) dengan role bawaan tes, seperti seed.sql: service_role tidak boleh menulis auth.users
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000077', 'petugas.panggilan@halobpom.go.id')
on conflict (id) do nothing;
insert into public.petugas (id, nama) values ('00000000-0000-0000-0000-000000000077', 'Petugas Panggilan')
on conflict (id) do nothing;
insert into public.penelepon (id, no_telp, nama_pelapor) values ('88888888-0000-0000-0000-000000000001', '081234567890', 'Budi Santoso');

-- 3. Panggilan baru tercatat dengan tahap pertama (gateway lewat service_role)
set local role service_role;
select public.laporkan_panggilan_aktif('77777777-0000-0000-0000-000000000001'::uuid, null, null, 'mendengar');
select is(
  (select tahap_ai from public.percakapan where id = '77777777-0000-0000-0000-000000000001'),
  'mendengar', 'Panggilan baru tercatat dengan tahap mendengar'
);
select is(
  (select status_penyelesaian::text from public.percakapan where id = '77777777-0000-0000-0000-000000000001'),
  'berjalan', 'Panggilan baru berstatus berjalan'
);

-- 4. Pembaruan: tahap terbaru menimpa, nilai null tidak menghapus jenis dan topik
select public.laporkan_panggilan_aktif('77777777-0000-0000-0000-000000000001'::uuid, 'informasi_produk', 'Informasi produk', 'memproses');
select public.laporkan_panggilan_aktif('77777777-0000-0000-0000-000000000001'::uuid, null, null, 'menjawab');
select results_eq(
  $$ select tahap_ai, jenis_interaksi::text, topik from public.percakapan where id = '77777777-0000-0000-0000-000000000001' $$,
  $$ values ('menjawab'::text, 'informasi_produk'::text, 'Informasi produk'::text) $$,
  'Tahap terbaru tercatat dan jenis serta topik dipertahankan'
);
select throws_ok(
  $$ select public.laporkan_panggilan_aktif('77777777-0000-0000-0000-000000000001'::uuid, null, null, 'tidur') $$,
  '22023', null, 'Tahap di luar mendengar, memproses, menjawab ditolak'
);

-- 5. Dua panggilan lain: satu akan berakhir, satu akan menjadi yatim
select public.laporkan_panggilan_aktif('77777777-0000-0000-0000-000000000002'::uuid, 'pengaduan', 'Pengaduan produk', 'mendengar');
select public.laporkan_panggilan_aktif('77777777-0000-0000-0000-000000000003'::uuid, null, null, 'mendengar');
update public.percakapan set penelepon_id = '88888888-0000-0000-0000-000000000001' where id = '77777777-0000-0000-0000-000000000002';

-- 6. Petugas melihat ketiganya, dengan nomor tersamar
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000077';
select is((select count(*)::int from public.panggilan_berjalan), 3, 'Petugas melihat tiga panggilan aktif');
select is(
  (select tahap_ai from public.panggilan_berjalan where percakapan_id = '77777777-0000-0000-0000-000000000001'),
  'menjawab', 'Daftar aktif menampilkan tahap terbaru'
);
select is(
  (select no_telp_tersamar from public.panggilan_berjalan where percakapan_id = '77777777-0000-0000-0000-000000000002'),
  '0812****7890', 'Nomor telepon pada daftar aktif tersamar'
);

-- 7. Panggilan berakhir: hilang dari daftar aktif, waktu selesai terisi
reset role;
set local role service_role;
select is(public.akhiri_panggilan_aktif('77777777-0000-0000-0000-000000000002'::uuid), true, 'Panggilan berjalan berhasil ditutup');
select is(public.akhiri_panggilan_aktif('77777777-0000-0000-0000-000000000099'::uuid), false, 'Menutup panggilan yang tidak dikenal tidak error dan mengembalikan false');
select isnt(
  (select waktu_selesai from public.percakapan where id = '77777777-0000-0000-0000-000000000002'),
  null, 'Waktu selesai terisi saat panggilan berakhir'
);
-- panggilan yang sudah selesai tidak dibuka lagi oleh heartbeat yang terlambat
select public.laporkan_panggilan_aktif('77777777-0000-0000-0000-000000000002'::uuid, null, null, 'mendengar');
select is(
  (select status_penyelesaian::text from public.percakapan where id = '77777777-0000-0000-0000-000000000002'),
  'terputus', 'Heartbeat terlambat tidak membuka kembali panggilan yang sudah selesai'
);

-- 8. Heartbeat berhenti: panggilan 3 tidak tampil lagi walau belum disapu
update public.percakapan set heartbeat_terakhir = now() - interval '5 minutes' where id = '77777777-0000-0000-0000-000000000003';
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000077';
select results_eq(
  $$ select percakapan_id::text from public.panggilan_berjalan $$,
  $$ values ('77777777-0000-0000-0000-000000000001'::text) $$,
  'Hanya panggilan dengan heartbeat segar yang tampil di daftar aktif'
);

-- 9. Penyapuan menutup panggilan yatim
reset role;
set local role service_role;
select is(public.tutup_panggilan_yatim(), 1, 'Penyapuan menutup satu panggilan yatim');
select is(
  (select status_penyelesaian::text from public.percakapan where id = '77777777-0000-0000-0000-000000000003'),
  'terputus', 'Panggilan yatim yang belum dijawab berstatus terputus setelah disapu (REQ-4.1)'
);

select * from finish();
rollback;
