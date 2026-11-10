begin;
select plan(24);

-- 1. Hak akses: pengguna anon ditolak
set local role anon;

select throws_ok(
  $$ select * from public.hasil_telaah $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca tabel hasil_telaah'
);

select throws_ok(
  $$ select * from public.jadwal_pemeriksaan $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca tabel jadwal_pemeriksaan'
);

select throws_ok(
  $$ select public.simpan_telaah('ADU-20261104-0010', 'Telaah Dokumen', 'Catatan uji') $$,
  '42501',
  null,
  'Pengguna anon tidak boleh memanggil RPC simpan_telaah'
);

select throws_ok(
  $$ select public.simpan_jadwal_pemeriksaan('ADU-20261104-0010', '2026-11-10'::date, 'BBPOM di Surabaya') $$,
  '42501',
  null,
  'Pengguna anon tidak boleh memanggil RPC simpan_jadwal_pemeriksaan'
);

-- 2. Siapkan pengguna uji dan data
reset role;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000099', 'petugas.telaah@halobpom.go.id')
on conflict (id) do nothing;

insert into public.petugas (id, nama)
values ('00000000-0000-0000-0000-000000000099', 'Petugas Telaah')
on conflict (id) do nothing;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000077', 'bukan.petugas@example.com')
on conflict (id) do nothing;

set local role service_role;

insert into public.penelepon (id, no_telp, nama_pelapor)
values ('77777777-0000-0000-0000-000000000001', '081234567890', 'Budi Santoso')
on conflict (id) do nothing;

-- 5 percakapan uji
insert into public.percakapan (id, penelepon_id, jenis_interaksi, status_penyelesaian, waktu_mulai)
values
  ('88888888-0000-0000-0000-000000000010', '77777777-0000-0000-0000-000000000001', 'pengaduan', 'tiket_terbit', now()),
  ('88888888-0000-0000-0000-000000000020', '77777777-0000-0000-0000-000000000001', 'pengaduan', 'tiket_terbit', now()),
  ('88888888-0000-0000-0000-000000000030', '77777777-0000-0000-0000-000000000001', 'pengaduan', 'tiket_terbit', now()),
  ('88888888-0000-0000-0000-000000000040', '77777777-0000-0000-0000-000000000001', 'pengaduan', 'tiket_terbit', now()),
  ('88888888-0000-0000-0000-000000000050', '77777777-0000-0000-0000-000000000001', 'pengaduan', 'tiket_terbit', now())
on conflict (id) do nothing;

-- 5 tiket pengaduan
insert into public.tiket (id, no_tiket, jenis, percakapan_id, status, tgl_terbit, ringkasan)
values
  ('99999999-0000-0000-0000-000000000010', 'ADU-20261104-0010', 'pengaduan', '88888888-0000-0000-0000-000000000010', 'belum_ditelaah', now(), 'Pengaduan t1'),
  ('99999999-0000-0000-0000-000000000020', 'ADU-20261104-0020', 'pengaduan', '88888888-0000-0000-0000-000000000020', 'belum_ditelaah', now(), 'Pengaduan t2'),
  ('99999999-0000-0000-0000-000000000030', 'ADU-20261104-0030', 'pengaduan', '88888888-0000-0000-0000-000000000030', 'belum_ditelaah', now(), 'Pengaduan t3'),
  ('99999999-0000-0000-0000-000000000040', 'ADU-20261104-0040', 'pengaduan', '88888888-0000-0000-0000-000000000040', 'selesai', now() - interval '1 day', 'Pengaduan selesai'),
  ('99999999-0000-0000-0000-000000000050', 'ADU-20261104-0050', 'pengaduan', '88888888-0000-0000-0000-000000000050', 'diteruskan', now() - interval '1 day', 'Pengaduan diteruskan')
on conflict (id) do nothing;

-- 3. Uji sebagai pengguna bukan petugas: ditolak
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000077';

select is(
  (select count(*)::int from public.hasil_telaah),
  0,
  'Pengguna bukan petugas membaca 0 baris dari hasil_telaah'
);

select throws_ok(
  $$ select public.simpan_telaah('ADU-20261104-0010', 'Telaah Dokumen', 'Catatan') $$,
  '42501',
  null,
  'Pengguna bukan petugas ditolak memanggil simpan_telaah'
);

select throws_ok(
  $$ select public.simpan_jadwal_pemeriksaan('ADU-20261104-0010', '2026-11-10'::date, 'BBPOM di Surabaya') $$,
  '42501',
  null,
  'Pengguna bukan petugas ditolak memanggil simpan_jadwal_pemeriksaan'
);

-- 4. Uji sebagai petugas terautentikasi
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000099';

-- Skenario A: Telaah Dokumen -> sedang_ditelaah (REQ-6.1, REQ-6.2)
select lives_ok(
  $$ select public.simpan_telaah('ADU-20261104-0010', 'Telaah Dokumen', 'Label tidak mencantumkan nomor izin edar.') $$,
  'Petugas dapat menyimpan hasil telaah dokumen'
);

select is(
  (select status from public.tiket where no_tiket = 'ADU-20261104-0010'),
  'sedang_ditelaah'::public.status_tiket,
  'Status tiket t1 berubah menjadi sedang_ditelaah'
);

select is(
  (select tindak_lanjut from public.hasil_telaah where tiket_id = '99999999-0000-0000-0000-000000000010'),
  'telaah_dokumen'::public.tindak_lanjut,
  'Riwayat hasil telaah t1 tersimpan dengan enum telaah_dokumen'
);

-- Skenario B: Perlu Pemeriksaan Lapangan -> menunggu jadwal -> simpan jadwal -> menunggu_pemeriksaan (REQ-6.2, REQ-6.3)
select lives_ok(
  $$ select public.simpan_telaah('ADU-20261104-0020', 'Perlu Pemeriksaan Lapangan', 'Perlu pemeriksaan sarana gudang distribusi.') $$,
  'Petugas menyimpan telaah pemeriksaan lapangan'
);

select is(
  (select status from public.tiket where no_tiket = 'ADU-20261104-0020'),
  'sedang_ditelaah'::public.status_tiket,
  'Status tiket t2 adalah sedang_ditelaah saat menunggu penetapan jadwal'
);

select lives_ok(
  $$ select public.simpan_jadwal_pemeriksaan('ADU-20261104-0020', '2026-11-15'::date, 'BBPOM di Surabaya') $$,
  'Petugas menyimpan jadwal pemeriksaan'
);

select is(
  (select status from public.tiket where no_tiket = 'ADU-20261104-0020'),
  'menunggu_pemeriksaan'::public.status_tiket,
  'Status tiket t2 berubah menjadi menunggu_pemeriksaan setelah jadwal tersimpan'
);

select is(
  (select unit_pelaksana from public.jadwal_pemeriksaan where tiket_id = '99999999-0000-0000-0000-000000000020'),
  'BBPOM di Surabaya'::text,
  'Jadwal pemeriksaan tersimpan dengan unit pelaksana yang benar'
);

-- Skenario C: Bukan Kewenangan BPOM -> diteruskan dan berhenti di sini (BR-3)
select lives_ok(
  $$ select public.simpan_telaah('ADU-20261104-0030', 'Bukan Kewenangan BPOM', 'Produk masuk kategori industri rumah tangga daerah.') $$,
  'Petugas menyimpan telaah bukan kewenangan BPOM'
);

select is(
  (select status from public.tiket where no_tiket = 'ADU-20261104-0030'),
  'diteruskan'::public.status_tiket,
  'Status tiket t3 berubah menjadi diteruskan'
);

-- Upaya menelaah kembali tiket yang berstatus diteruskan ditolak (BR-3)
select throws_ok(
  $$ select public.simpan_telaah('ADU-20261104-0030', 'Telaah Dokumen', 'Upaya telaah ulang') $$,
  '55000',
  null,
  'Tiket yang berstatus diteruskan tidak bisa ditelaah lagi'
);

-- Tiket t4 (berstatus selesai) tidak bisa ditelaah lagi
select throws_ok(
  $$ select public.simpan_telaah('ADU-20261104-0040', 'Telaah Dokumen', 'Upaya telaah tiket selesai') $$,
  '55000',
  null,
  'Tiket yang berstatus selesai tidak bisa ditelaah lagi'
);

-- Tiket t5 (berstatus diteruskan sejak awal) tidak bisa dijadwalkan
select throws_ok(
  $$ select public.simpan_jadwal_pemeriksaan('ADU-20261104-0050', '2026-11-20'::date, 'Balai POM') $$,
  '55000',
  null,
  'Tiket yang berstatus diteruskan tidak bisa dijadwalkan'
);

-- Validasi input jadwal kosong
select throws_ok(
  $$ select public.simpan_jadwal_pemeriksaan('ADU-20261104-0020', null, 'Balai POM') $$,
  '22023',
  'Tanggal pemeriksaan wajib diisi.',
  'Tanggal pemeriksaan kosong ditolak'
);

select throws_ok(
  $$ select public.simpan_jadwal_pemeriksaan('ADU-20261104-0020', '2026-11-20'::date, '  ') $$,
  '22023',
  'Unit pelaksana wajib diisi.',
  'Unit pelaksana kosong ditolak'
);

-- Hak tulis INSERT langsung ke tabel ditolak untuk authenticated
select throws_ok(
  $$ insert into public.hasil_telaah (tiket_id, tindak_lanjut, petugas_id) values ('99999999-0000-0000-0000-000000000010'::uuid, 'telaah_dokumen', '00000000-0000-0000-0000-000000000099'::uuid) $$,
  '42501',
  null,
  'Petugas tidak boleh melakukan direct INSERT ke tabel hasil_telaah'
);

select throws_ok(
  $$ insert into public.jadwal_pemeriksaan (tiket_id, tanggal, unit_pelaksana, petugas_id) values ('99999999-0000-0000-0000-000000000010'::uuid, '2026-11-20'::date, 'Unit', '00000000-0000-0000-0000-000000000099'::uuid) $$,
  '42501',
  null,
  'Petugas tidak boleh melakukan direct INSERT ke tabel jadwal_pemeriksaan'
);

select * from finish();
rollback;
