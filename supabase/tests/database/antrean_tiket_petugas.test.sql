begin;
select plan(15);

-- 1. Hak akses: pengguna anon ditolak mengakses view, tabel, dan RPC
set local role anon;

select throws_ok(
  $$ select * from public.antrean_tiket_petugas $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca view antrean_tiket_petugas'
);

select throws_ok(
  $$ select * from public.detail_pengaduan_tiket $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca view detail_pengaduan_tiket'
);

select throws_ok(
  $$ select public.ambil_detail_pengaduan_tiket('ADU-20261102-0088') $$,
  '42501',
  null,
  'Pengguna anon tidak boleh memanggil RPC ambil_detail_pengaduan_tiket'
);

select throws_ok(
  $$ select * from public.penelepon_tersamar $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca view penelepon_tersamar'
);

select throws_ok(
  $$ select * from public.tiket $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca tabel tiket'
);

-- 2. Siapkan akun petugas uji dengan role bawaan tes, seperti seed.sql: service_role tidak boleh menulis auth.users
reset role;
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000088', 'petugas.antrean@halobpom.go.id')
on conflict (id) do nothing;

insert into public.petugas (id, nama)
values ('00000000-0000-0000-0000-000000000088', 'Petugas Antrean')
on conflict (id) do nothing;

-- Siapkan data dummy dengan service_role
set local role service_role;

-- Siapkan penelepon dengan data mentah
insert into public.penelepon (id, no_telp, nama_pelapor)
values ('33333333-0000-0000-0000-000000000001', '081234567890', 'Budi Santoso');

-- Siapkan percakapan
insert into public.percakapan (id, penelepon_id, jenis_interaksi, status_penyelesaian)
values
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'pengaduan', 'tiket_terbit'),
  ('44444444-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', 'informasi_produk', 'dieskalasi');

-- Siapkan tiket:
-- t1: pengaduan belum_ditelaah
-- t2: eskalasi sedang_ditelaah
insert into public.tiket (id, no_tiket, jenis, percakapan_id, status, tgl_terbit, ringkasan)
values
  ('55555555-0000-0000-0000-000000000001', 'ADU-20261102-0088', 'pengaduan', '44444444-0000-0000-0000-000000000001', 'belum_ditelaah', now(), 'Krim Wajah Glowing menimbulkan ruam'),
  ('55555555-0000-0000-0000-000000000002', 'ESK-20261102-0089', 'eskalasi', '44444444-0000-0000-0000-000000000002', 'sedang_ditelaah', now() - interval '1 hour', 'Pertanyaan efek samping sirup');

-- Siapkan pengaduan
insert into public.pengaduan (id, percakapan_id, tiket_id, nama_produk, kronologi, nama_pelapor, nomor_telepon, kelengkapan)
values (
  '66666666-0000-0000-0000-000000000001',
  '44444444-0000-0000-0000-000000000001',
  '55555555-0000-0000-0000-000000000001',
  'Krim Wajah Glowing',
  'Kulit wajah memerah dan gatal setelah pemakaian malam',
  'Budi Santoso',
  '081234567890',
  true
);

-- 3. Uji sebagai petugas terautentikasi
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000088';

-- Uji pembacaan penelepon_tersamar (nomor telepon disamarkan di server)
select results_eq(
  $$ select no_telp, nama_pelapor from public.penelepon_tersamar where id = '33333333-0000-0000-0000-000000000001' $$,
  $$ values ('0812****7890'::text, 'B***'::text) $$,
  'Petugas melihat nomor telepon dan nama pelapor yang tersamar pada penelepon_tersamar'
);

-- Uji view antrean tiket terurut dari status belum_ditelaah
select is(
  (select no_tiket from public.antrean_tiket_petugas limit 1),
  'ADU-20261102-0088',
  'Antrean tiket menampilkan tiket berstatus belum_ditelaah di urutan pertama'
);

-- Uji nomor telepon tersamar pada view antrean tiket
select is(
  (select no_telp_tersamar from public.antrean_tiket_petugas where no_tiket = 'ADU-20261102-0088'),
  '0812****7890',
  'Antrean tiket menampilkan nomor telepon yang sudah disamarkan'
);

-- Uji detail pengaduan untuk satu tiket memuat data lengkap dan data pribadi tersamar
select is(
  (select nama_produk from public.detail_pengaduan_tiket where no_tiket = 'ADU-20261102-0088'),
  'Krim Wajah Glowing',
  'Detail pengaduan menampilkan nama produk yang diadukan'
);

select is(
  (select no_telp_tersamar from public.detail_pengaduan_tiket where no_tiket = 'ADU-20261102-0088'),
  '0812****7890',
  'Detail pengaduan menampilkan nomor telepon pelapor yang tersamar'
);

-- Uji RPC ambil_detail_pengaduan_tiket mengembalikan JSON dengan nomor tersamar
select is(
  (public.ambil_detail_pengaduan_tiket('ADU-20261102-0088') ->> 'no_telp_tersamar'),
  '0812****7890',
  'RPC ambil_detail_pengaduan_tiket mengembalikan no_telp_tersamar'
);

-- Uji RPC ambil_detail_pengaduan_tiket gagal jika tiket tidak ada
select throws_ok(
  $$ select public.ambil_detail_pengaduan_tiket('ADU-99999999-9999') $$,
  'P0002',
  null,
  'Tiket tidak ditemukan menghasilkan kode error P0002'
);

-- 4. Uji larangan modifikasi: petugas TIDAK memiliki hak akses tulis pada tabel tiket (Sprint 3, UC-06)
select throws_ok(
  $$ update public.tiket set status = 'selesai' where no_tiket = 'ADU-20261102-0088' $$,
  '42501',
  null,
  'Petugas tidak boleh mengubah status tiket di task ini'
);

select throws_ok(
  $$ insert into public.tiket (no_tiket, jenis, percakapan_id) values ('ADU-20261102-9999', 'pengaduan', '44444444-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'Petugas tidak boleh menambah tiket secara langsung'
);

select throws_ok(
  $$ delete from public.tiket where no_tiket = 'ADU-20261102-0088' $$,
  '42501',
  null,
  'Petugas tidak boleh menghapus tiket'
);

rollback;
