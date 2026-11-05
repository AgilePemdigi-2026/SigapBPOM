begin;
select plan(19);

-- 1. Hak akses: pengguna anon ditolak
set local role anon;

select throws_ok(
  $$ select * from public.tanggapan $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca tabel tanggapan'
);

select throws_ok(
  $$ select public.simpan_tanggapan('ADU-20261104-0010', 'Tanggapan uji') $$,
  '42501',
  null,
  'Pengguna anon tidak boleh memanggil RPC simpan_tanggapan'
);

select throws_ok(
  $$ select public.tutup_tiket('ADU-20261104-0010') $$,
  '42501',
  null,
  'Pengguna anon tidak boleh memanggil RPC tutup_tiket'
);

-- 2. Siapkan pengguna uji dan data
reset role;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000099', 'petugas.tanggapan@halobpom.go.id')
on conflict (id) do nothing;

insert into public.petugas (id, nama)
values ('00000000-0000-0000-0000-000000000099', 'Petugas Tanggapan')
on conflict (id) do nothing;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000077', 'bukan.petugas@example.com')
on conflict (id) do nothing;

set local role service_role;

insert into public.penelepon (id, no_telp, nama_pelapor)
values ('77777777-0000-0000-0000-000000000002', '081234567891', 'Siti Rahma')
on conflict (id) do nothing;

insert into public.percakapan (id, penelepon_id, jenis_interaksi, status_penyelesaian, waktu_mulai)
values
  ('88888888-0000-0000-0000-000000000060', '77777777-0000-0000-0000-000000000002', 'pengaduan', 'tiket_terbit', now()),
  ('88888888-0000-0000-0000-000000000070', '77777777-0000-0000-0000-000000000002', 'pengaduan', 'tiket_terbit', now()),
  ('88888888-0000-0000-0000-000000000080', '77777777-0000-0000-0000-000000000002', 'pengaduan', 'tiket_terbit', now())
on conflict (id) do nothing;

insert into public.tiket (id, no_tiket, jenis, percakapan_id, status, tgl_terbit, ringkasan)
values
  ('99999999-0000-0000-0000-000000000060', 'ADU-20261104-0060', 'pengaduan', '88888888-0000-0000-0000-000000000060', 'sedang_ditelaah', now(), 'Pengaduan t6'),
  ('99999999-0000-0000-0000-000000000070', 'ADU-20261104-0070', 'pengaduan', '88888888-0000-0000-0000-000000000070', 'sedang_ditelaah', now(), 'Pengaduan t7'),
  ('99999999-0000-0000-0000-000000000080', 'ADU-20261104-0080', 'pengaduan', '88888888-0000-0000-0000-000000000080', 'diteruskan', now() - interval '1 day', 'Pengaduan t8 diteruskan')
on conflict (id) do nothing;

-- 3. Uji sebagai pengguna bukan petugas: ditolak
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000077';

select is(
  (select count(*)::int from public.tanggapan),
  0,
  'Pengguna bukan petugas membaca 0 baris dari tanggapan'
);

select throws_ok(
  $$ select public.simpan_tanggapan('ADU-20261104-0060', 'Tanggapan uji') $$,
  '42501',
  null,
  'Pengguna bukan petugas ditolak memanggil simpan_tanggapan'
);

select throws_ok(
  $$ select public.tutup_tiket('ADU-20261104-0060') $$,
  '42501',
  null,
  'Pengguna bukan petugas ditolak memanggil tutup_tiket'
);

-- 4. Uji sebagai petugas terautentikasi
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000099';

-- Skenario A (REQ-6.5, BR-2): Tutup tiket tanpa tanggapan ditolak dengan pesan kamus
select throws_ok(
  $$ select public.tutup_tiket('ADU-20261104-0060') $$,
  'SGBR2',
  'Tiket tidak dapat ditutup. Susun tanggapan terlebih dahulu.',
  'Tutup tiket tanpa tanggapan ditolak sesuai BR-2'
);

-- Skenario B: Tanggapan kosong ditolak (REQ-6.4)
select throws_ok(
  $$ select public.simpan_tanggapan('ADU-20261104-0060', '   ') $$,
  '22023',
  'Tanggapan wajib diisi.',
  'Tanggapan kosong ditolak'
);

-- Skenario C: Simpan tanggapan berhasil (REQ-6.4)
select is(
  (select public.simpan_tanggapan('ADU-20261104-0060', 'Produk telah ditarik dari peredaran dan sarana diberikan peringatan keras.')),
  'tanggapan_disusun'::public.status_tiket,
  'simpan_tanggapan mengembalikan status tanggapan_disusun'
);

select is(
  (select status from public.tiket where no_tiket = 'ADU-20261104-0060'),
  'tanggapan_disusun'::public.status_tiket,
  'Status tiket t6 berubah menjadi tanggapan_disusun'
);

select is(
  (select count(*)::int from public.tanggapan where tiket_id = '99999999-0000-0000-0000-000000000060'),
  1,
  'Tabel tanggapan memiliki 1 baris untuk tiket t6'
);

-- Skenario D: Tutup tiket setelah tanggapan (REQ-6.6)
select is(
  (select public.tutup_tiket('ADU-20261104-0060')),
  'selesai'::public.status_tiket,
  'tutup_tiket mengembalikan status selesai'
);

select is(
  (select status from public.tiket where no_tiket = 'ADU-20261104-0060'),
  'selesai'::public.status_tiket,
  'Status tiket t6 menjadi selesai'
);

select is(
  (select count(*)::int from public.notifikasi where tiket_id = '99999999-0000-0000-0000-000000000060'),
  1,
  'Notifikasi SMS berhasil diantrekan saat tiket ditutup'
);

select is(
  (select status_kirim from public.notifikasi where tiket_id = '99999999-0000-0000-0000-000000000060'),
  'tertunda'::public.status_kirim_notifikasi,
  'Status kirim notifikasi awal adalah tertunda'
);

-- Skenario E: Menutup dua kali tidak membuat notifikasi ganda (Idempoten)
select is(
  (select public.tutup_tiket('ADU-20261104-0060')),
  'selesai'::public.status_tiket,
  'Memanggil tutup_tiket kembali tetap mengembalikan status selesai'
);

select is(
  (select count(*)::int from public.notifikasi where tiket_id = '99999999-0000-0000-0000-000000000060'),
  1,
  'Jumlah notifikasi tidak bertambah saat tiket ditutup ulang (idempoten)'
);

-- Skenario F: Tiket berstatus diteruskan ditolak untuk ditanggapi atau ditutup
select throws_ok(
  $$ select public.simpan_tanggapan('ADU-20261104-0080', 'Tanggapan untuk tiket diteruskan') $$,
  'SG409',
  null,
  'Tiket diteruskan tidak dapat ditanggapi'
);

select throws_ok(
  $$ select public.tutup_tiket('ADU-20261104-0080') $$,
  'SG409',
  null,
  'Tiket diteruskan tidak dapat ditutup'
);

-- Hak tulis INSERT langsung ke tabel ditolak untuk authenticated
select throws_ok(
  $$ insert into public.tanggapan (tiket_id, isi, petugas_id) values ('99999999-0000-0000-0000-000000000060'::uuid, 'Direct insert', '00000000-0000-0000-0000-000000000099'::uuid) $$,
  '42501',
  null,
  'Petugas tidak boleh direct INSERT ke tabel tanggapan'
);

finish();
rollback;
