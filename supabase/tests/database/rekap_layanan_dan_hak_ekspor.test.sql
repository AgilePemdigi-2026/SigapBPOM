begin;
select plan(18);

-- 1. Hak akses: pengguna anon ditolak
set local role anon;

select throws_ok(
  $$ select public.rekap_layanan('2026-09-01'::date, '2026-09-30'::date) $$,
  '42501',
  null,
  'Pengguna anon tidak boleh memanggil RPC rekap_layanan'
);

select throws_ok(
  $$ select public.boleh_ekspor() $$,
  '42501',
  null,
  'Pengguna anon tidak boleh memanggil fungsi boleh_ekspor'
);

-- 2. Siapkan pengguna uji
reset role;

-- Petugas A: memiliki hak ekspor
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000091', 'petugas.ekspor@halobpom.go.id')
on conflict (id) do nothing;

insert into public.petugas (id, nama, hak_ekspor)
values ('00000000-0000-0000-0000-000000000091', 'Petugas Berhak Ekspor', true)
on conflict (id) do update set hak_ekspor = true;

-- Petugas B: TIDAK memiliki hak ekspor
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000092', 'petugas.biasa@halobpom.go.id')
on conflict (id) do nothing;

insert into public.petugas (id, nama, hak_ekspor)
values ('00000000-0000-0000-0000-000000000092', 'Petugas Tanpa Ekspor', false)
on conflict (id) do update set hak_ekspor = false;

-- Pengguna non-petugas
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000077', 'bukan.petugas@example.com')
on conflict (id) do nothing;

-- 3. Uji pengguna bukan petugas
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000077';

select throws_ok(
  $$ select public.rekap_layanan('2026-09-01'::date, '2026-09-30'::date) $$,
  '42501',
  null,
  'Pengguna bukan petugas ditolak memanggil rekap_layanan'
);

select is(
  (select public.boleh_ekspor()),
  false,
  'Pengguna bukan petugas mengembalikan false pada boleh_ekspor'
);

-- 4. Uji hak ekspor petugas (BR-8, NFR-14)
-- Petugas B: tanpa hak ekspor
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000092';

select is(
  (select public.boleh_ekspor()),
  false,
  'Petugas tanpa hak ekspor terbaca false pada boleh_ekspor'
);

-- Petugas A: berhak ekspor
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000091';

select is(
  (select public.boleh_ekspor()),
  true,
  'Petugas dengan hak ekspor terbaca true pada boleh_ekspor'
);

-- 5. Siapkan data uji rekapitulasi layanan bulan September 2026
reset role;
set local role service_role;

insert into public.penelepon (id, no_telp, nama_pelapor)
values ('77777777-0000-0000-0000-000000000009', '081234567899', 'Warga Uji')
on conflict (id) do nothing;

-- Minggu 1: 2026-09-01 s.d. 2026-09-07 (2 panggilan, 1 eskalasi, 1 selesai)
insert into public.percakapan (id, penelepon_id, jenis_interaksi, status_penyelesaian, waktu_mulai)
values
  ('88888888-0000-0000-0000-000000000101', '77777777-0000-0000-0000-000000000009', 'informasi_produk', 'dieskalasi', '2026-09-02 10:00:00+07'),
  ('88888888-0000-0000-0000-000000000102', '77777777-0000-0000-0000-000000000009', 'pengaduan', 'tiket_terbit', '2026-09-05 14:00:00+07')
on conflict (id) do nothing;

insert into public.tiket (id, no_tiket, jenis, percakapan_id, status, tgl_terbit, ringkasan)
values
  ('99999999-0000-0000-0000-000000000101', 'ESK-20260902-0001', 'eskalasi', '88888888-0000-0000-0000-000000000101', 'belum_ditelaah', '2026-09-02 10:00:00+07', 'Kasus medis'),
  ('99999999-0000-0000-0000-000000000102', 'ADU-20260905-0001', 'pengaduan', '88888888-0000-0000-0000-000000000102', 'selesai', '2026-09-05 14:00:00+07', 'Pengaduan m1')
on conflict (id) do nothing;

-- Minggu 2: 2026-09-08 s.d. 2026-09-14 (1 panggilan pengaduan belum selesai)
insert into public.percakapan (id, penelepon_id, jenis_interaksi, status_penyelesaian, waktu_mulai)
values
  ('88888888-0000-0000-0000-000000000103', '77777777-0000-0000-0000-000000000009', 'pengaduan', 'tiket_terbit', '2026-09-10 11:00:00+07')
on conflict (id) do nothing;

insert into public.tiket (id, no_tiket, jenis, percakapan_id, status, tgl_terbit, ringkasan)
values
  ('99999999-0000-0000-0000-000000000103', 'ADU-20260910-0001', 'pengaduan', '88888888-0000-0000-0000-000000000103', 'sedang_ditelaah', '2026-09-10 11:00:00+07', 'Pengaduan m2')
on conflict (id) do nothing;

-- 6. Uji perhitungan rekapitulasi layanan sebagai petugas
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000091';

-- Uji validasi parameter input tidak sah
select throws_ok(
  $$ select public.rekap_layanan(null, '2026-09-30'::date) $$,
  '22023',
  'Periode tanggal wajib diisi',
  'Tanggal awal null ditolak'
);

select throws_ok(
  $$ select public.rekap_layanan('2026-09-30'::date, '2026-09-01'::date) $$,
  '22023',
  'Tanggal awal tidak boleh melebihi tanggal akhir',
  'Tanggal awal lebih besar dari akhir ditolak'
);

-- Uji hasil rekapitulasi data September 2026
select lives_ok(
  $$ select public.rekap_layanan('2026-09-01'::date, '2026-09-30'::date) $$,
  'Petugas dapat mengeksekusi rekap_layanan'
);

-- Total panggilan = 3 (2 di minggu 1, 1 di minggu 2)
select is(
  ((public.rekap_layanan('2026-09-01'::date, '2026-09-30'::date) -> 'total' ->> 'panggilan')::int),
  3,
  'Total panggilan periode September 2026 adalah 3'
);

-- Total kasus tereskalasi = 1 (di minggu 1)
select is(
  ((public.rekap_layanan('2026-09-01'::date, '2026-09-30'::date) -> 'total' ->> 'tereskalasi')::int),
  1,
  'Total kasus tereskalasi periode September 2026 adalah 1'
);

-- Total pengaduan selesai = 1 (di minggu 1)
select is(
  ((public.rekap_layanan('2026-09-01'::date, '2026-09-30'::date) -> 'total' ->> 'pengaduan_selesai')::int),
  1,
  'Total pengaduan selesai periode September 2026 adalah 1'
);

-- Rincian mingguan memiliki 5 blok (September 30 hari: 7+7+7+7+2)
select is(
  jsonb_array_length(public.rekap_layanan('2026-09-01'::date, '2026-09-30'::date) -> 'per_minggu'),
  5,
  'Rincian per_minggu September 2026 memiliki 5 baris minggu'
);

-- Minggu 1: panggilan = 2, tereskalasi = 1, pengaduan_selesai = 1
select is(
  ((public.rekap_layanan('2026-09-01'::date, '2026-09-30'::date) -> 'per_minggu' -> 0 ->> 'panggilan')::int),
  2,
  'Minggu 1 memiliki 2 panggilan'
);

select is(
  ((public.rekap_layanan('2026-09-01'::date, '2026-09-30'::date) -> 'per_minggu' -> 0 ->> 'tereskalasi')::int),
  1,
  'Minggu 1 memiliki 1 kasus tereskalasi'
);

select is(
  ((public.rekap_layanan('2026-09-01'::date, '2026-09-30'::date) -> 'per_minggu' -> 0 ->> 'pengaduan_selesai')::int),
  1,
  'Minggu 1 memiliki 1 pengaduan selesai'
);

-- 7. Uji periode kosong (Januari 2025): mengembalikan nol (REQ-8.2)
select is(
  ((public.rekap_layanan('2025-01-01'::date, '2025-01-31'::date) -> 'total' ->> 'panggilan')::int),
  0,
  'Periode kosong mengembalikan 0 panggilan'
);

select is(
  ((public.rekap_layanan('2025-01-01'::date, '2025-01-31'::date) -> 'total' ->> 'tereskalasi')::int),
  0,
  'Periode kosong mengembalikan 0 tereskalasi'
);

select is(
  ((public.rekap_layanan('2025-01-01'::date, '2025-01-31'::date) -> 'total' ->> 'pengaduan_selesai')::int),
  0,
  'Periode kosong mengembalikan 0 pengaduan selesai'
);

finish();
rollback;
