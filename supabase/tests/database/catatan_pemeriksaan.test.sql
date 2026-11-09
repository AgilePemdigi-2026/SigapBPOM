begin;
select plan(15);

-- 1. Hak akses: pengguna anon ditolak
set local role anon;

select throws_ok(
  $$ select * from public.catatan_pemeriksaan $$,
  '42501',
  null,
  'Pengguna anon tidak boleh membaca tabel catatan_pemeriksaan'
);

select throws_ok(
  $$ select public.simpan_catatan_pemeriksaan('88888888-0000-0000-0000-000000000001'::uuid, 'Catatan uji') $$,
  '42501',
  null,
  'Pengguna anon tidak boleh memanggil RPC simpan_catatan_pemeriksaan'
);

select throws_ok(
  $$ select public.ambil_catatan_pemeriksaan('88888888-0000-0000-0000-000000000001'::uuid) $$,
  '42501',
  null,
  'Pengguna anon tidak boleh memanggil RPC ambil_catatan_pemeriksaan'
);

-- 2. Siapkan pengguna uji
reset role;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000099', 'petugas.catatan@halobpom.go.id')
on conflict (id) do nothing;

insert into public.petugas (id, nama)
values ('00000000-0000-0000-0000-000000000099', 'Petugas Catatan')
on conflict (id) do nothing;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000077', 'bukan.petugas@example.com')
on conflict (id) do nothing;

-- Siapkan data percakapan uji
set local role service_role;

insert into public.penelepon (id, no_telp, nama_pelapor)
values ('77777777-0000-0000-0000-000000000001', '081234567890', 'Budi Santoso')
on conflict (id) do nothing;

insert into public.percakapan (id, penelepon_id, jenis_interaksi, status_penyelesaian, waktu_mulai, ringkasan)
values
  ('88888888-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', 'pengaduan', 'selesai_ai', now(), 'Percakapan uji catatan')
on conflict (id) do nothing;

-- 3. Uji sebagai pengguna bukan petugas: ditolak
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000077';

select is(
  (select count(*)::int from public.catatan_pemeriksaan),
  0,
  'Pengguna bukan petugas membaca 0 baris dari catatan_pemeriksaan'
);

select throws_ok(
  $$ select public.simpan_catatan_pemeriksaan('88888888-0000-0000-0000-000000000001'::uuid, 'Perlu verifikasi') $$,
  '42501',
  null,
  'Pengguna bukan petugas ditolak menyimpan catatan pemeriksaan'
);

select throws_ok(
  $$ select public.ambil_catatan_pemeriksaan('88888888-0000-0000-0000-000000000001'::uuid) $$,
  '42501',
  null,
  'Pengguna bukan petugas ditolak membaca catatan pemeriksaan'
);

-- 4. Uji sebagai petugas terautentikasi
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000099';

-- Catatan kosong ditolak (REQ-5.4)
select throws_ok(
  $$ select public.simpan_catatan_pemeriksaan('88888888-0000-0000-0000-000000000001'::uuid, '') $$,
  '22023',
  'Catatan pemeriksaan wajib diisi.',
  'Catatan pemeriksaan string kosong ditolak dengan pesan yang sesuai'
);

select throws_ok(
  $$ select public.simpan_catatan_pemeriksaan('88888888-0000-0000-0000-000000000001'::uuid, '    ') $$,
  '22023',
  'Catatan pemeriksaan wajib diisi.',
  'Catatan pemeriksaan berisi spasi saja ditolak dengan pesan yang sesuai'
);

select throws_ok(
  $$ select public.simpan_catatan_pemeriksaan('88888888-0000-0000-0000-000000000001'::uuid, null) $$,
  '22023',
  'Catatan pemeriksaan wajib diisi.',
  'Catatan pemeriksaan null ditolak dengan pesan yang sesuai'
);

-- Percakapan tidak ditemukan ditolak
select throws_ok(
  $$ select public.simpan_catatan_pemeriksaan('11111111-0000-0000-0000-000000000000'::uuid, 'Catatan valid') $$,
  'P0002',
  null,
  'Penyimpanan catatan pada id percakapan yang tidak ada ditolak'
);

-- Catatan sah tersimpan dan terbaca kembali (REQ-5.3)
select lives_ok(
  $$ select public.simpan_catatan_pemeriksaan('88888888-0000-0000-0000-000000000001'::uuid, 'Perlu verifikasi ulang data pelapor') $$,
  'Petugas dapat menyimpan catatan pemeriksaan yang valid'
);

select is(
  (select isi from public.catatan_pemeriksaan where percakapan_id = '88888888-0000-0000-0000-000000000001' order by waktu desc limit 1),
  'Perlu verifikasi ulang data pelapor'::text,
  'Catatan pemeriksaan tersimpan dan terbaca kembali'
);

select is(
  (select petugas_id from public.catatan_pemeriksaan where percakapan_id = '88888888-0000-0000-0000-000000000001' order by waktu desc limit 1),
  '00000000-0000-0000-0000-000000000099'::uuid,
  'Petugas pencatat tersimpan sesuai sesi petugas yang login'
);

-- RPC ini tidak mengubah status percakapan
select is(
  (select status_penyelesaian from public.percakapan where id = '88888888-0000-0000-0000-000000000001'),
  'selesai_ai'::public.status_penyelesaian,
  'Status percakapan tidak berubah setelah penyimpanan catatan'
);

-- Hak tulis INSERT langsung ke tabel catatan_pemeriksaan ditolak untuk authenticated
select throws_ok(
  $$ insert into public.catatan_pemeriksaan (percakapan_id, petugas_id, isi) values ('88888888-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000099'::uuid, 'Direct insert') $$,
  '42501',
  null,
  'Petugas terautentikasi tidak boleh melakukan INSERT langsung ke tabel catatan_pemeriksaan'
);

finish();
rollback;
