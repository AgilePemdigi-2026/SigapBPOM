-- T-F7.3-01, REQ-6.6: antrean notifikasi SMS tindak lanjut. tutup_tiket (T-F7.2-01) belum ada, jadi penutupan tiket
-- disimulasikan dengan mengubah status menjadi selesai lalu memanggil antrekan_notifikasi_tindak_lanjut.
begin;
select plan(24);

-- 1. Tabel tidak menyimpan nomor telepon
select hasnt_column('public', 'notifikasi', 'nomor_telepon', 'Tabel notifikasi tidak menyimpan nomor telepon');
select hasnt_column('public', 'notifikasi', 'no_telp', 'Tabel notifikasi tidak menyimpan no_telp');

-- 2. Data uji
set local role service_role;

insert into public.penelepon (id, no_telp, nama_pelapor)
values ('77777777-0000-0000-0000-000000000731', '081234567890', 'Budi Santoso');

insert into public.percakapan (id, penelepon_id, jenis_interaksi, status_penyelesaian)
values
  ('88888888-0000-0000-0000-000000000731', '77777777-0000-0000-0000-000000000731', 'pengaduan', 'tiket_terbit'),
  ('88888888-0000-0000-0000-000000000732', '77777777-0000-0000-0000-000000000731', 'pengaduan', 'tiket_terbit');

insert into public.tiket (id, no_tiket, jenis, percakapan_id, status)
values
  ('99999999-0000-0000-0000-000000000731', 'ADU-20261105-0731', 'pengaduan', '88888888-0000-0000-0000-000000000731', 'tanggapan_disusun'),
  ('99999999-0000-0000-0000-000000000732', 'ADU-20261105-0732', 'pengaduan', '88888888-0000-0000-0000-000000000732', 'tanggapan_disusun');

-- Nomor di register pengaduan didahulukan dari nomor penelepon.
insert into public.pengaduan (percakapan_id, tiket_id, nama_produk, kronologi, nama_pelapor, nomor_telepon)
values ('88888888-0000-0000-0000-000000000731', '99999999-0000-0000-0000-000000000731', 'Sirup', 'Ruam', 'Budi', '081298765432');

-- 3. Validasi antrekan
select throws_ok(
  $$ select public.antrekan_notifikasi_tindak_lanjut('ADU-20261105-9999') $$,
  'P0002', null, 'Tiket yang tidak ada ditolak'
);
select throws_ok(
  $$ select public.antrekan_notifikasi_tindak_lanjut('ADU-20261105-0731') $$,
  '55000', null, 'Tiket yang belum selesai tidak diantrekan'
);

-- 4. Tutup tiket (simulasi tutup_tiket) dua kali: hanya satu baris antrean
update public.tiket set status = 'selesai' where id in ('99999999-0000-0000-0000-000000000731', '99999999-0000-0000-0000-000000000732');
select lives_ok($$ select public.antrekan_notifikasi_tindak_lanjut('ADU-20261105-0731') $$, 'Tiket selesai diantrekan');
select lives_ok($$ select public.antrekan_notifikasi_tindak_lanjut('ADU-20261105-0731') $$, 'Mengantrekan ulang tidak galat');
select is(
  (select count(*)::int from public.notifikasi where tiket_id = '99999999-0000-0000-0000-000000000731'),
  1, 'Menutup dua kali tidak membuat notifikasi ganda'
);
select is(
  (select status_kirim from public.notifikasi where tiket_id = '99999999-0000-0000-0000-000000000731'),
  'tertunda'::public.status_kirim_notifikasi, 'Notifikasi baru berstatus tertunda'
);

-- 5. Klaim: nomor dibaca di server, baris yang sudah diklaim tidak diklaim proses lain
select results_eq(
  $$ select no_tiket, nomor_telepon from public.klaim_notifikasi_tertunda(20, 5) $$,
  $$ values ('ADU-20261105-0731'::text, '081298765432'::text) $$,
  'Klaim mengembalikan nomor tiket dan nomor dari register pengaduan'
);
select is(
  (select count(*)::int from public.klaim_notifikasi_tertunda(20, 5)),
  0, 'Baris yang sedang mengirim tidak diklaim proses lain'
);

-- 6. Gagal kirim tercatat dan bisa diulang
select ok(
  public.catat_hasil_notifikasi((select id from public.notifikasi where tiket_id = '99999999-0000-0000-0000-000000000731'), false, null, 'Gateway tidak menjawab.'),
  'Hasil gagal tercatat'
);
select is(
  (select galat_terakhir from public.notifikasi where tiket_id = '99999999-0000-0000-0000-000000000731'),
  'Gateway tidak menjawab.', 'Galat terakhir tersimpan'
);
select is(
  (select count(*)::int from public.klaim_notifikasi_tertunda(20, 5)),
  1, 'Notifikasi gagal diklaim ulang'
);
select is(
  (select percobaan from public.notifikasi where tiket_id = '99999999-0000-0000-0000-000000000731'),
  2, 'Percobaan bertambah setiap klaim'
);

-- 7. Terkirim tidak pernah dikirim ulang dan tidak tertimpa
select ok(
  public.catat_hasil_notifikasi((select id from public.notifikasi where tiket_id = '99999999-0000-0000-0000-000000000731'), true, 'Isi SMS', null),
  'Hasil terkirim tercatat'
);
select isnt(
  (select tgl_kirim from public.notifikasi where tiket_id = '99999999-0000-0000-0000-000000000731'),
  null, 'Tanggal kirim terisi'
);
select ok(
  not public.catat_hasil_notifikasi((select id from public.notifikasi where tiket_id = '99999999-0000-0000-0000-000000000731'), false, null, 'x'),
  'Hasil terkirim tidak bisa ditimpa'
);
select is(
  (select count(*)::int from public.klaim_notifikasi_tertunda(20, 5)),
  0, 'Notifikasi terkirim tidak diklaim lagi'
);

-- 8. Nomor penelepon dipakai bila register pengaduan tidak punya nomor
select lives_ok($$ select public.antrekan_notifikasi_tindak_lanjut('ADU-20261105-0732') $$, 'Tiket kedua diantrekan');
select results_eq(
  $$ select nomor_telepon from public.klaim_notifikasi_tertunda(20, 5) $$,
  $$ values ('081234567890'::text) $$,
  'Klaim memakai nomor penelepon percakapan bila tidak ada di register pengaduan'
);

-- 9. Hak akses: anon dan authenticated tidak bisa membaca tabel maupun memanggil RPC
reset role;
set local role anon;
select throws_ok($$ select * from public.notifikasi $$, '42501', null, 'Anon tidak boleh membaca notifikasi');
select throws_ok($$ select * from public.klaim_notifikasi_tertunda(20, 5) $$, '42501', null, 'Anon tidak boleh mengklaim notifikasi');

reset role;
set local role authenticated;
select throws_ok($$ select * from public.notifikasi $$, '42501', null, 'Authenticated tidak boleh membaca notifikasi');
select throws_ok(
  $$ select public.antrekan_notifikasi_tindak_lanjut('ADU-20261105-0731') $$,
  '42501', null, 'Authenticated tidak boleh memanggil antrekan langsung'
);

select * from finish();
rollback;
