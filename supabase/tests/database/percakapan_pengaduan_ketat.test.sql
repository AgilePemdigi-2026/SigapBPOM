begin;
select plan(11);

reset role;
set local role service_role;

-- Percakapan uji: informasi produk, sudah bertiket, sudah tidak lengkap, dan pengaduan berjalan milik penelepon yang ada.
insert into public.penelepon (id, no_telp, nama_pelapor) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '081111111111', 'Pemilik Asli');

insert into public.percakapan (id, jenis_interaksi, status_penyelesaian, penelepon_id) values
  ('a1000000-0000-0000-0000-000000000001', 'informasi_produk', 'berjalan', null),
  ('a2000000-0000-0000-0000-000000000002', 'pengaduan', 'tiket_terbit', null),
  ('a3000000-0000-0000-0000-000000000003', 'pengaduan', 'pengaduan_tidak_lengkap', null),
  ('a4000000-0000-0000-0000-000000000004', 'pengaduan', 'berjalan', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000005', 'pengaduan', 'dieskalasi', null);

-- terbitkan_tiket_pengaduan: percakapan informasi produk ditolak
select throws_ok(
  $$ select public.terbitkan_tiket_pengaduan('a1000000-0000-0000-0000-000000000001'::uuid, 'Obat X', 'Kronologi', 'Budi', '081234567890') $$,
  'SG409', 'percakapan tidak dapat diubah',
  'Penerbitan tiket pada percakapan informasi_produk ditolak SG409'
);

-- terbitkan_tiket_pengaduan: percakapan yang sudah bertiket ditolak
select throws_ok(
  $$ select public.terbitkan_tiket_pengaduan('a2000000-0000-0000-0000-000000000002'::uuid, 'Obat X', 'Kronologi', 'Budi', '081234567890') $$,
  'SG409', 'percakapan tidak dapat diubah',
  'Penerbitan tiket pada percakapan berstatus tiket_terbit ditolak SG409'
);

-- terbitkan_tiket_pengaduan: percakapan pengaduan_tidak_lengkap atau status final lain ditolak
select throws_ok(
  $$ select public.terbitkan_tiket_pengaduan('a3000000-0000-0000-0000-000000000003'::uuid, 'Obat X', 'Kronologi', 'Budi', '081234567890') $$,
  'SG409', 'percakapan tidak dapat diubah',
  'Penerbitan tiket pada percakapan pengaduan_tidak_lengkap ditolak SG409'
);
select throws_ok(
  $$ select public.terbitkan_tiket_pengaduan('a5000000-0000-0000-0000-000000000005'::uuid, 'Obat X', 'Kronologi', 'Budi', '081234567890') $$,
  'SG409', 'percakapan tidak dapat diubah',
  'Penerbitan tiket pada percakapan dieskalasi ditolak SG409'
);

-- simpan_pengaduan_tidak_lengkap: tiga kasus penolakan
select throws_ok(
  $$ select public.simpan_pengaduan_tidak_lengkap('a1000000-0000-0000-0000-000000000001'::uuid, 'Obat X', null, null, null) $$,
  'SG409', 'percakapan tidak dapat diubah',
  'Simpan tidak lengkap pada percakapan informasi_produk ditolak SG409'
);
select throws_ok(
  $$ select public.simpan_pengaduan_tidak_lengkap('a2000000-0000-0000-0000-000000000002'::uuid, 'Obat X', null, null, null) $$,
  'SG409', 'percakapan tidak dapat diubah',
  'Simpan tidak lengkap pada percakapan yang sudah bertiket ditolak SG409'
);
select throws_ok(
  $$ select public.simpan_pengaduan_tidak_lengkap('a3000000-0000-0000-0000-000000000003'::uuid, 'Obat X', null, null, null) $$,
  'SG409', 'percakapan tidak dapat diubah',
  'Simpan tidak lengkap kedua pada percakapan yang sudah tidak lengkap ditolak SG409'
);

-- Penolakan tidak mengubah status percakapan
select is(
  (select status_penyelesaian from public.percakapan where id = 'a2000000-0000-0000-0000-000000000002'),
  'tiket_terbit'::public.status_penyelesaian,
  'Percakapan yang ditolak tidak berubah status'
);

-- Simpan tidak lengkap tidak menimpa penelepon yang sudah ada
select lives_ok(
  $$ select public.simpan_pengaduan_tidak_lengkap('a4000000-0000-0000-0000-000000000004'::uuid, 'Obat X', null, 'Penyusup', '082222222222') $$,
  'Simpan tidak lengkap pada pengaduan berjalan diterima'
);
select is(
  (select no_telp || '|' || nama_pelapor from public.penelepon where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '081111111111|Pemilik Asli',
  'Nomor dan nama penelepon yang sudah ada tidak ditimpa'
);

-- Percakapan pengaduan berjalan tanpa penelepon tetap bisa diterbitkan tiketnya
insert into public.percakapan (id, jenis_interaksi) values ('a6000000-0000-0000-0000-000000000006', 'pengaduan');
select matches(
  public.terbitkan_tiket_pengaduan('a6000000-0000-0000-0000-000000000006'::uuid, 'Obat X', 'Kronologi lengkap', 'Budi', '081234567890'),
  '^ADU-[0-9]{8}-[0-9]{4}$',
  'Percakapan pengaduan berjalan tetap bisa diterbitkan tiketnya'
);

select * from finish();
rollback;
