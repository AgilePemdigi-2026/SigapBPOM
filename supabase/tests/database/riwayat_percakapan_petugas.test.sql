begin;
select plan(19);

-- 1. Hak akses: pengguna anon ditolak mengakses view, tabel mentah, dan RPC
set local role anon;

select throws_ok(
  $$ select * from public.riwayat_percakapan $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca view riwayat_percakapan'
);

select throws_ok(
  $$ select * from public.ringkasan_periode_percakapan $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca view ringkasan_periode_percakapan'
);

select throws_ok(
  $$ select * from public.ucapan_petugas $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca view ucapan_petugas'
);

select throws_ok(
  $$ select public.ambil_ringkasan_periode_percakapan() $$,
  '42501',
  null,
  'Pengguna anon tidak boleh memanggil RPC ambil_ringkasan_periode_percakapan'
);

select throws_ok(
  $$ select public.ambil_transkrip_percakapan('88888888-0000-0000-0000-000000000002'::uuid) $$,
  '42501',
  null,
  'Pengguna anon tidak boleh memanggil RPC ambil_transkrip_percakapan'
);

select throws_ok(
  $$ select * from public.ucapan $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca tabel mentah ucapan'
);

select throws_ok(
  $$ select * from public.penelepon $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca tabel mentah penelepon'
);

-- 2. Siapkan akun uji
reset role;

-- Petugas terdaftar
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000099', 'petugas.riwayat@halobpom.go.id')
on conflict (id) do nothing;

insert into public.petugas (id, nama)
values ('00000000-0000-0000-0000-000000000099', 'Petugas Riwayat')
on conflict (id) do nothing;

-- Pengguna terautentikasi biasa (bukan petugas)
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000077', 'bukan.petugas@example.com')
on conflict (id) do nothing;

-- Siapkan data dummy dengan service_role
set local role service_role;

insert into public.penelepon (id, no_telp, nama_pelapor)
values ('77777777-0000-0000-0000-000000000001', '081234567890', 'Budi Santoso');

insert into public.percakapan (id, penelepon_id, jenis_interaksi, status_penyelesaian, waktu_mulai, ringkasan)
values
  ('88888888-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', 'informasi_produk', 'selesai_ai', now() - interval '2 hours', 'Pertanyaan NIE susu formula'),
  ('88888888-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000001', 'pengaduan', 'tiket_terbit', now() - interval '1 hour', 'Pengaduan kosmetik ilegal'),
  ('88888888-0000-0000-0000-000000000003', '77777777-0000-0000-0000-000000000001', 'informasi_produk', 'dieskalasi', now() - interval '30 minutes', 'Pertanyaan efek samping sirup');

insert into public.tiket (id, no_tiket, jenis, percakapan_id, status, tgl_terbit, ringkasan)
values
  ('99999999-0000-0000-0000-000000000002', 'ADU-20261104-0001', 'pengaduan', '88888888-0000-0000-0000-000000000002', 'belum_ditelaah', now() - interval '1 hour', 'Pengaduan kosmetik ilegal'),
  ('99999999-0000-0000-0000-000000000003', 'ESK-20261104-0001', 'eskalasi', '88888888-0000-0000-0000-000000000003', 'sedang_ditelaah', now() - interval '30 minutes', 'Pertanyaan efek samping sirup');

insert into public.pengaduan (id, percakapan_id, tiket_id, nama_produk, kronologi, nama_pelapor, nomor_telepon, kelengkapan)
values (
  'aaaaaaaa-0000-0000-0000-000000000002',
  '88888888-0000-0000-0000-000000000002',
  '99999999-0000-0000-0000-000000000002',
  'Krim Wajah Alami',
  'Wajah kemerahan setelah pemakaian',
  'Budi Santoso',
  '081234567890',
  true
);

insert into public.ucapan (percakapan_id, urutan, pembicara, teks, detik_ke)
values
  ('88888888-0000-0000-0000-000000000002', 1, 'sistem', 'Silakan sebutkan nama produk, kronologi kejadian, nama, dan nomor telepon Anda.', 0),
  ('88888888-0000-0000-0000-000000000002', 2, 'penelepon', 'Nama saya Budi Santoso, nomor saya 0812****7890 mengadukan krim wajah alami.', 5),
  ('88888888-0000-0000-0000-000000000002', 3, 'sistem', 'Terima kasih Bapak Budi Santoso, laporan Anda telah kami catat.', 15);

-- 3. Uji sebagai pengguna bukan petugas: ditolak / hasil kosong
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000077';

select is(
  (select count(*)::int from public.riwayat_percakapan),
  0,
  'Pengguna bukan petugas membaca 0 baris dari riwayat_percakapan'
);

select is(
  (select count(*)::int from public.ucapan_petugas),
  0,
  'Pengguna bukan petugas membaca 0 baris dari ucapan_petugas'
);

select throws_ok(
  $$ select public.ambil_ringkasan_periode_percakapan() $$,
  '42501',
  null,
  'Pengguna bukan petugas tidak boleh memanggil ambil_ringkasan_periode_percakapan'
);

select throws_ok(
  $$ select public.ambil_transkrip_percakapan('88888888-0000-0000-0000-000000000002'::uuid) $$,
  '42501',
  null,
  'Pengguna bukan petugas tidak boleh memanggil ambil_transkrip_percakapan'
);

-- 4. Uji sebagai petugas terautentikasi
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000099';

-- Petugas dapat membaca 3 baris riwayat percakapan
select is(
  (select count(*)::int from public.riwayat_percakapan),
  3,
  'Petugas dapat membaca seluruh riwayat percakapan'
);

-- Nomor telepon pelapor disamarkan di view riwayat_percakapan (NFR-13)
select is(
  (select no_telp_tersamar from public.riwayat_percakapan where id = '88888888-0000-0000-0000-000000000002'),
  '0812****7890'::text,
  'Nomor telepon pelapor tersamar di view riwayat_percakapan'
);

-- Tidak ada nomor telepon mentah di view riwayat_percakapan
select is(
  (select count(*)::int from public.riwayat_percakapan where no_telp_tersamar = '081234567890'),
  0,
  'Tidak ada nomor telepon mentah yang keluar dari riwayat_percakapan'
);

-- Ringkasan periode kartu statistik sesuai agregasi data
select results_eq(
  $$ select total_percakapan, informasi_produk, pengaduan_produk, dieskalasi from public.ringkasan_periode_percakapan $$,
  $$ values (3::int, 2::int, 1::int, 1::int) $$,
  'Ringkasan periode menghitung total, informasi_produk, pengaduan_produk, dan dieskalasi dengan benar'
);

-- RPC ambil_ringkasan_periode_percakapan mengembalikan json yang benar
select is(
  (select public.ambil_ringkasan_periode_percakapan()->>'total_percakapan')::int,
  3,
  'RPC ambil_ringkasan_periode_percakapan mengembalikan total_percakapan 3'
);

-- Transkrip ucapan petugas menyamarkan nama pelapor di teks (REQ-5.2, NFR-13)
select is(
  (select teks from public.ucapan_petugas where percakapan_id = '88888888-0000-0000-0000-000000000002' and urutan = 2),
  'Nama saya B*** S******, nomor saya 0812****7890 mengadukan krim wajah alami.'::text,
  'Nama pelapor dan nomor telepon disamarkan pada ucapan penelepon'
);

select is(
  (select teks from public.ucapan_petugas where percakapan_id = '88888888-0000-0000-0000-000000000002' and urutan = 3),
  'Terima kasih Bapak B*** S******, laporan Anda telah kami catat.'::text,
  'Nama pelapor disamarkan pada ucapan sistem'
);

-- Hak tulis (INSERT) pada view ditolak untuk authenticated
select throws_ok(
  $$ insert into public.riwayat_percakapan (id) values (gen_random_uuid()) $$,
  '42501',
  null,
  'Petugas terautentikasi tidak boleh melakukan INSERT pada view riwayat_percakapan'
);

select throws_ok(
  $$ insert into public.ucapan_petugas (id) values (1) $$,
  '42501',
  null,
  'Petugas terautentikasi tidak boleh melakukan INSERT pada view ucapan_petugas'
);

finish();
rollback;
