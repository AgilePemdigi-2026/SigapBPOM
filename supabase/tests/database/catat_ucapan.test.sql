-- T-F1.1-03, T-F1.1-05 (NFR-20): ucapan tersimpan berurutan dengan detik_ke dari waktu mulai percakapan; log_tool ditulis service_role.
begin;
select plan(16);

-- 1. Hak akses: hanya service_role yang boleh menambah ucapan dan menulis log_tool
set local role anon;
select throws_ok(
  $$ select public.catat_ucapan('55555555-0000-0000-0000-000000000001'::uuid, 'penelepon', 'halo') $$,
  '42501', null, 'anon tidak boleh memanggil catat_ucapan'
);
select throws_ok(
  $$ insert into public.log_tool (nama_tool, durasi_ms, berhasil) values ('cek_registrasi_bpom', 10, true) $$,
  '42501', null, 'anon tidak boleh menulis log_tool'
);

reset role;
set local role authenticated;
select throws_ok(
  $$ select public.catat_ucapan('55555555-0000-0000-0000-000000000001'::uuid, 'penelepon', 'halo') $$,
  '42501', null, 'authenticated tidak boleh memanggil catat_ucapan'
);
select throws_ok(
  $$ select * from public.ucapan $$,
  '42501', null, 'authenticated belum boleh membaca ucapan (pembacaan transkrip menyusul di UC-05)'
);

-- 2. Percakapan dimulai 42 detik lalu, seperti baris yang dibuat laporan panggilan aktif pertama
reset role;
set local role service_role;
insert into public.percakapan (id, waktu_mulai) values
  ('55555555-0000-0000-0000-000000000001', now() - interval '42 seconds'),
  ('55555555-0000-0000-0000-000000000002', now());

-- 3. Urutan dihitung server dan bertambah per percakapan
select is(
  public.catat_ucapan('55555555-0000-0000-0000-000000000001'::uuid, 'sistem', 'Silakan sebutkan nama produk atau pertanyaan Anda.'),
  1, 'Ucapan pertama mendapat urutan 1'
);
select is(
  public.catat_ucapan('55555555-0000-0000-0000-000000000001'::uuid, 'penelepon', 'Susu Formula Sehat'),
  2, 'Ucapan berikutnya mendapat urutan 2'
);
select is(
  public.catat_ucapan('55555555-0000-0000-0000-000000000002'::uuid, 'penelepon', 'Halo'),
  1, 'Urutan percakapan lain dimulai lagi dari 1'
);
select results_eq(
  $$ select urutan, pembicara::text, teks, detik_ke from public.ucapan
      where percakapan_id = '55555555-0000-0000-0000-000000000001' order by urutan $$,
  $$ values (1, 'sistem'::text, 'Silakan sebutkan nama produk atau pertanyaan Anda.'::text, 42),
            (2, 'penelepon'::text, 'Susu Formula Sehat'::text, 42) $$,
  'Ucapan tersimpan berurutan dengan pembicara, teks, dan detik ke dari waktu mulai percakapan'
);

-- 4. Masukan tidak valid dan percakapan yang tidak ada ditolak
select throws_ok(
  $$ select public.catat_ucapan('55555555-0000-0000-0000-000000000099'::uuid, 'penelepon', 'halo') $$,
  'P0002', null, 'Percakapan yang tidak ada ditolak dengan P0002'
);
select throws_ok(
  $$ select public.catat_ucapan('55555555-0000-0000-0000-000000000001'::uuid, 'penelepon', '   ') $$,
  '22023', null, 'Teks kosong ditolak'
);
select throws_ok(
  $$ select public.catat_ucapan('55555555-0000-0000-0000-000000000001'::uuid, 'penelepon', repeat('a', 2001)) $$,
  '22023', null, 'Teks lebih dari 2000 karakter ditolak'
);
select throws_ok(
  $$ select public.catat_ucapan('55555555-0000-0000-0000-000000000001'::uuid, 'petugas', 'halo') $$,
  '22P02', null, 'Pembicara di luar sistem dan penelepon ditolak enum'
);
select is(
  (select count(*)::int from public.ucapan where percakapan_id = '55555555-0000-0000-0000-000000000001'),
  2, 'Ucapan yang ditolak tidak tersimpan'
);

-- 5. Panggilan yang sudah ditutup: kiriman yang masih di jalan diterima, giliran yang terlambat ditolak
insert into public.percakapan (id, waktu_mulai, waktu_selesai, status_penyelesaian) values
  ('55555555-0000-0000-0000-000000000003', now() - interval '3 minutes', now() - interval '30 seconds', 'selesai_ai'),
  ('55555555-0000-0000-0000-000000000004', now() - interval '10 minutes', now() - interval '5 minutes', 'selesai_ai');
select is(
  public.catat_ucapan('55555555-0000-0000-0000-000000000003'::uuid, 'sistem', 'Terima kasih sudah menghubungi HaloBPOM. Percakapan ini saya tutup ya.'),
  1, 'Ucapan yang tiba sesaat setelah panggilan ditutup tetap tersimpan'
);
select throws_ok(
  $$ select public.catat_ucapan('55555555-0000-0000-0000-000000000004'::uuid, 'penelepon', 'halo') $$,
  '55000', null, 'Ucapan untuk panggilan yang ditutup lebih dari 2 menit lalu ditolak dengan 55000'
);

-- 6. Log tool dari gateway: hanya nama, durasi, dan berhasil tidaknya
select lives_ok(
  $$ insert into public.log_tool (percakapan_id, nama_tool, durasi_ms, berhasil)
     values ('55555555-0000-0000-0000-000000000001', 'cari_basis_pengetahuan', 35, true) $$,
  'service_role boleh menulis log_tool'
);

select * from finish();
rollback;
