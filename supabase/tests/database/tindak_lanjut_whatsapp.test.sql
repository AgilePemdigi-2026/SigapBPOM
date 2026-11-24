-- ADR 0006: tindak lanjut lewat WhatsApp manual. Jalur SMS mati, nomor lengkap hanya lewat ambil_kontak_pelapor untuk
-- petugas, dan tandai_sudah_dihubungi mencatat kontak (ADU setelah ditutup, ESK langsung selesai).
begin;
select plan(25);

-- 1. Jalur SMS otomatis sudah tidak ada
select is((select count(*)::int from cron.job where jobname = 'kirim-notifikasi-sms'), 0, 'Jadwal kirim-notifikasi-sms dihapus');
select hasnt_trigger('public', 'tiket', 'antrekan_sms_nomor_tiket', 'Trigger SMS nomor tiket dihapus');
select hasnt_function('public', 'klaim_notifikasi_tertunda', 'RPC klaim SMS dihapus');
select hasnt_function('public', 'picu_kirim_notifikasi', 'Pemicu kirim-notifikasi dihapus');
select has_column('public', 'detail_pengaduan_tiket', 'sudah_dihubungi', 'Detail pengaduan memuat sudah_dihubungi');

-- 2. Data uji
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000124', 'petugas.wa@halobpom.go.id'),
  ('00000000-0000-0000-0000-000000000125', 'bukan.petugas.wa@example.com')
on conflict (id) do nothing;
insert into public.petugas (id, nama) values ('00000000-0000-0000-0000-000000000124', 'Petugas WA') on conflict (id) do nothing;

insert into public.penelepon (id, no_telp, nama_pelapor)
values ('77777777-0000-0000-0000-000000001241', '081234567890', 'Budi Santoso');

insert into public.percakapan (id, penelepon_id, jenis_interaksi, status_penyelesaian) values
  ('88888888-0000-0000-0000-000000001241', '77777777-0000-0000-0000-000000001241', 'pengaduan', 'tiket_terbit'),
  ('88888888-0000-0000-0000-000000001242', '77777777-0000-0000-0000-000000001241', 'pengaduan', 'tiket_terbit'),
  ('88888888-0000-0000-0000-000000001243', '77777777-0000-0000-0000-000000001241', 'informasi_produk', 'dieskalasi');

insert into public.tiket (id, no_tiket, jenis, percakapan_id, status) values
  ('99999999-0000-0000-0000-000000001241', 'ADU-20261124-1241', 'pengaduan', '88888888-0000-0000-0000-000000001241', 'tanggapan_disusun'),
  ('99999999-0000-0000-0000-000000001242', 'ADU-20261124-1242', 'pengaduan', '88888888-0000-0000-0000-000000001242', 'sedang_ditelaah'),
  ('99999999-0000-0000-0000-000000001243', 'ESK-20261124-1243', 'eskalasi', '88888888-0000-0000-0000-000000001243', 'belum_ditelaah');

-- Nomor di register pengaduan didahulukan dari nomor penelepon.
insert into public.pengaduan (percakapan_id, tiket_id, nama_produk, kronologi, nama_pelapor, nomor_telepon)
values ('88888888-0000-0000-0000-000000001241', '99999999-0000-0000-0000-000000001241', 'Sirup', 'Ruam', 'Budi', '081298765432');

-- Tiket baru tidak lagi mengantrekan SMS nomor tiket.
select is((select count(*)::int from public.notifikasi where tiket_id in (
  '99999999-0000-0000-0000-000000001241', '99999999-0000-0000-0000-000000001242', '99999999-0000-0000-0000-000000001243'
)), 0, 'Tiket baru tidak mengantrekan notifikasi apa pun');

-- 3. Hak akses
set local role anon;
select throws_ok($$ select public.ambil_kontak_pelapor('ADU-20261124-1241') $$, '42501', null, 'Anon tidak boleh membaca kontak pelapor');
select throws_ok($$ select public.tandai_sudah_dihubungi('ESK-20261124-1243') $$, '42501', null, 'Anon tidak boleh menandai kontak');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000125';
select throws_ok($$ select public.ambil_kontak_pelapor('ADU-20261124-1241') $$, '42501', null, 'Bukan petugas tidak boleh membaca kontak pelapor');
select throws_ok($$ select public.tandai_sudah_dihubungi('ESK-20261124-1243') $$, '42501', null, 'Bukan petugas tidak boleh menandai kontak');

-- 4. Petugas membaca nomor lengkap
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000124';
select is(public.ambil_kontak_pelapor('ADU-20261124-1241') ->> 'no_telp', '081298765432', 'Nomor register pengaduan didahulukan');
select is(public.ambil_kontak_pelapor('ESK-20261124-1243') ->> 'no_telp', '081234567890', 'Tanpa register pengaduan, nomor penelepon dipakai');
select is((public.ambil_kontak_pelapor('ADU-20261124-1241') ->> 'sudah_dihubungi')::boolean, false, 'Awalnya belum dihubungi');
select throws_ok($$ select public.ambil_kontak_pelapor('ADU-20261124-9999') $$, 'P0002', null, 'Tiket tidak ada ditolak');
select throws_ok($$ select public.ambil_kontak_pelapor(' ') $$, '22023', null, 'Nomor tiket kosong ditolak');

-- 5. Pengaduan: baru bisa ditandai setelah ditutup
select throws_ok($$ select public.tandai_sudah_dihubungi('ADU-20261124-1242') $$, '55000', null, 'Pengaduan yang belum ditutup tidak bisa ditandai');
select is(public.tutup_tiket('ADU-20261124-1241'), 'selesai'::public.status_tiket, 'Tiket ditutup');
select is(
  (select sudah_dihubungi from public.detail_pengaduan_tiket where no_tiket = 'ADU-20261124-1241' limit 1),
  false,
  'Tiket selesai tampil belum dihubungi'
);
select is((public.tandai_sudah_dihubungi('ADU-20261124-1241') ->> 'sudah_dihubungi')::boolean, true, 'Pengaduan selesai ditandai sudah dihubungi');
select is(
  (select sudah_dihubungi from public.detail_pengaduan_tiket where no_tiket = 'ADU-20261124-1241' limit 1),
  true,
  'Detail pengaduan menampilkan sudah dihubungi'
);

-- Menandai ulang tidak mengubah waktu kontak pertama.
reset role;
update public.notifikasi set tgl_kirim = '2026-11-24 01:00:00+00' where tiket_id = '99999999-0000-0000-0000-000000001241';
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000124';
select is(
  (public.tandai_sudah_dihubungi('ADU-20261124-1241') ->> 'dihubungi_pada')::timestamptz,
  '2026-11-24 01:00:00+00'::timestamptz,
  'Menandai ulang tidak mengubah waktu kontak'
);

-- 6. Eskalasi: ditandai langsung selesai
select is((public.tandai_sudah_dihubungi('ESK-20261124-1243') ->> 'sudah_dihubungi')::boolean, true, 'Tiket eskalasi ditandai sudah dihubungi');

reset role;
select is((select status from public.tiket where no_tiket = 'ESK-20261124-1243'), 'selesai'::public.status_tiket, 'Tiket eskalasi menjadi selesai');
select isnt((select tgl_selesai from public.tiket where no_tiket = 'ESK-20261124-1243'), null, 'tgl_selesai eskalasi terisi');
select is(
  (select dihubungi_oleh from public.notifikasi where tiket_id = '99999999-0000-0000-0000-000000001243'),
  '00000000-0000-0000-0000-000000000124'::uuid,
  'Petugas yang menghubungi tercatat'
);

select * from finish();
rollback;
