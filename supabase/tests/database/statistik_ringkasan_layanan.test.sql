begin;
select plan(18);

-- 1. Hak akses: anon ditolak mengakses RPC dan view
set local role anon;

select throws_ok(
  $$ select public.ambil_ringkasan_layanan() $$,
  '42501',
  null,
  'Pengguna anon tidak boleh mengeksekusi ambil_ringkasan_layanan'
);

select throws_ok(
  $$ select public.ambil_statistik_layanan() $$,
  '42501',
  null,
  'Pengguna anon tidak boleh mengeksekusi ambil_statistik_layanan'
);

select throws_ok(
  $$ select * from public.ringkasan_statistik_layanan $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca view ringkasan_statistik_layanan'
);

select throws_ok(
  $$ select * from public.persentase_kategori_7_hari $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca view persentase_kategori_7_hari'
);

select throws_ok(
  $$ select * from public.kasus_perlu_tindak_lanjut $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca view kasus_perlu_tindak_lanjut'
);

-- 2. Siapkan data dummy dengan service_role
reset role;
set local role service_role;

-- Siapkan akun petugas uji
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000099', 'petugas.ringkasan@halobpom.go.id')
on conflict (id) do nothing;

insert into public.petugas (id, nama, email)
values ('00000000-0000-0000-0000-000000000099', 'Petugas Ringkasan', 'petugas.ringkasan@halobpom.go.id')
on conflict (id) do nothing;

-- Siapkan percakapan dummy
-- Hari ini (Asia/Jakarta):
-- p1: selesai_ai, Obat
-- p2: selesai_ai, Obat
-- p3: dieskalasi, Makanan
-- p4: tiket_terbit, Kosmetik
-- p5: berjalan, Kosmetik
-- 2 hari lalu:
-- p6: selesai_ai, Obat
-- 10 hari lalu (di luar 7 hari):
-- p7: selesai_ai, Obat
insert into public.percakapan (id, waktu_mulai, status_penyelesaian, topik) values
  ('11111111-0000-0000-0000-000000000001', now(), 'selesai_ai', 'Obat'),
  ('11111111-0000-0000-0000-000000000002', now(), 'selesai_ai', 'Obat'),
  ('11111111-0000-0000-0000-000000000003', now(), 'dieskalasi', 'Makanan'),
  ('11111111-0000-0000-0000-000000000004', now(), 'tiket_terbit', 'Kosmetik'),
  ('11111111-0000-0000-0000-000000000005', now(), 'berjalan', 'Kosmetik'),
  ('11111111-0000-0000-0000-000000000006', now() - interval '2 days', 'selesai_ai', 'Obat'),
  ('11111111-0000-0000-0000-000000000007', now() - interval '10 days', 'selesai_ai', 'Obat');
-- p8: berjalan tetapi heartbeat berhenti 5 menit lalu (panggilan yatim yang belum disapu), di luar rentang 7 hari
insert into public.percakapan (id, waktu_mulai, status_penyelesaian, heartbeat_terakhir) values
  ('11111111-0000-0000-0000-000000000008', now() - interval '10 days', 'berjalan', now() - interval '5 minutes');

-- Siapkan tiket dummy:
-- t1: eskalasi, belum_ditelaah, hari ini
-- t2: pengaduan, belum_ditelaah, hari ini
-- t3: pengaduan, selesai, 1 hari lalu
insert into public.tiket (id, no_tiket, jenis, percakapan_id, status, tgl_terbit, ringkasan) values
  ('22222222-0000-0000-0000-000000000001', 'ESK-20261102-0001', 'eskalasi', '11111111-0000-0000-0000-000000000003', 'belum_ditelaah', now(), 'Butuh konsultasi dosis'),
  ('22222222-0000-0000-0000-000000000002', 'ADU-20261102-0001', 'pengaduan', '11111111-0000-0000-0000-000000000004', 'belum_ditelaah', now(), 'Kosmetik menyebabkan iritasi'),
  ('22222222-0000-0000-0000-000000000003', 'ADU-20261101-0001', 'pengaduan', '11111111-0000-0000-0000-000000000006', 'selesai', now() - interval '1 day', 'Pengaduan obat palsu selesai');

-- 3. Uji sebagai petugas terautentikasi
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000099';

-- Uji panggilan hari ini = 5
select results_eq(
  $$ select panggilan_hari_ini from public.ringkasan_statistik_layanan $$,
  $$ values (5) $$,
  'Statistik panggilan hari ini bernilai 5'
);

-- Uji jawaban otomatis AI hari ini = 2
select results_eq(
  $$ select jawaban_otomatis_ai from public.ringkasan_statistik_layanan $$,
  $$ values (2) $$,
  'Statistik jawaban otomatis AI hari ini bernilai 2'
);

-- Uji tiket eskalasi baru hari ini = 1
select results_eq(
  $$ select tiket_eskalasi_baru from public.ringkasan_statistik_layanan $$,
  $$ values (1) $$,
  'Statistik tiket eskalasi baru hari ini bernilai 1'
);

-- Uji pengaduan selesai = 1
select results_eq(
  $$ select pengaduan_selesai from public.ringkasan_statistik_layanan $$,
  $$ values (1) $$,
  'Statistik pengaduan selesai bernilai 1'
);

-- Uji panggilan berjalan = 1 (REQ-4.2): p8 tanpa heartbeat segar tidak dihitung, sama seperti view panggilan_berjalan
select results_eq(
  $$ select panggilan_berjalan from public.ringkasan_statistik_layanan $$,
  $$ values (1) $$,
  'Statistik panggilan berjalan bernilai 1 dan tidak menghitung panggilan tanpa heartbeat segar'
);

-- Uji persentase kategori 7 hari terakhir (total 6 percakapan dalam 7 hari)
-- Obat: 3 (50.00%)
-- Kosmetik: 2 (33.33%)
-- Makanan: 1 (16.67%)
select results_eq(
  $$ select kategori, jumlah, persentase from public.persentase_kategori_7_hari $$,
  $$ values
       ('Obat'::text, 3, 50.00::numeric),
       ('Kosmetik'::text, 2, 33.33::numeric),
       ('Makanan'::text, 1, 16.67::numeric)
  $$,
  'Persentase pertanyaan per kategori 7 hari terakhir dihitung dengan tepat'
);

-- Uji kasus perlu tindak lanjut (status belum_ditelaah = 2 kasus)
select is(
  (select count(*)::int from public.kasus_perlu_tindak_lanjut),
  2,
  'Kasus perlu tindak lanjut menampilkan tiket berstatus belum_ditelaah'
);

-- Uji RPC ambil_statistik_layanan mengembalikan JSON objek yang benar
select is(
  (public.ambil_statistik_layanan() ->> 'panggilan_hari_ini')::int,
  5,
  'RPC ambil_statistik_layanan mengembalikan panggilan_hari_ini = 5'
);

-- Uji RPC ambil_ringkasan_layanan mengembalikan struktur lengkap
select is(
  (public.ambil_ringkasan_layanan() -> 'statistik' ->> 'jawaban_otomatis_ai')::int,
  2,
  'RPC ambil_ringkasan_layanan mengembalikan jawaban_otomatis_ai = 2'
);

select is(
  (public.ambil_statistik_layanan() ->> 'panggilan_berjalan')::int,
  1,
  'RPC ambil_statistik_layanan tidak menghitung panggilan tanpa heartbeat segar'
);

select is(
  (public.ambil_ringkasan_layanan() -> 'statistik' ->> 'panggilan_berjalan')::int,
  1,
  'RPC ambil_ringkasan_layanan tidak menghitung panggilan tanpa heartbeat segar'
);

select is(
  jsonb_array_length(public.ambil_ringkasan_layanan() -> 'kasus_perlu_tindak_lanjut'),
  2,
  'RPC ambil_ringkasan_layanan mengembalikan daftar 2 kasus perlu tindak lanjut'
);

select is(
  jsonb_array_length(public.ambil_ringkasan_layanan() -> 'kategori'),
  3,
  'RPC ambil_ringkasan_layanan mengembalikan 3 kategori dalam 7 hari terakhir'
);

rollback;
