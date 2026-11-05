begin;
select plan(7);

insert into public.percakapan (id, jenis_interaksi, waktu_mulai, waktu_selesai, status_penyelesaian) values
  ('66666666-6666-6666-6666-666666666666', 'informasi_produk', now() - interval '1 hour', now() - interval '50 minutes', 'selesai_ai');

-- 1-2. Hak akses: hanya service_role (Edge Function catat-percakapan)
set local role anon;
select throws_ok(
  $$ select public.simpan_ringkasan_percakapan('66666666-6666-6666-6666-666666666666', 'Ringkasan.') $$,
  '42501', null, 'anon tidak boleh menyimpan ringkasan'
);
set local role authenticated;
select throws_ok(
  $$ select public.simpan_ringkasan_percakapan('66666666-6666-6666-6666-666666666666', 'Ringkasan.') $$,
  '42501', null, 'authenticated tidak boleh menyimpan ringkasan'
);
reset role;
set local role service_role;

-- 3. Percakapan tidak ada
select throws_ok(
  $$ select public.simpan_ringkasan_percakapan('99999999-9999-9999-9999-999999999999', 'Ringkasan.') $$,
  'P0002', null, 'percakapan tidak ditemukan melempar P0002'
);

-- 4. Ringkasan kosong atau terlalu panjang ditolak
select throws_ok(
  $$ select public.simpan_ringkasan_percakapan('66666666-6666-6666-6666-666666666666', repeat('a', 501)) $$,
  '22023', null, 'ringkasan lebih dari 500 karakter ditolak'
);

-- 5. Panggilan yang sudah berakhir tetap bisa diberi ringkasan
select lives_ok(
  $$ select public.simpan_ringkasan_percakapan('66666666-6666-6666-6666-666666666666', '  Penelepon menanyakan izin edar Paracetamol.  ') $$,
  'ringkasan disimpan setelah panggilan berakhir'
);
select is(
  (select ringkasan from public.percakapan where id = '66666666-6666-6666-6666-666666666666'),
  'Penelepon menanyakan izin edar Paracetamol.',
  'ringkasan tersimpan tanpa spasi tepi'
);

-- 6. Ringkasan yang sudah ada tidak ditimpa
select public.simpan_ringkasan_percakapan('66666666-6666-6666-6666-666666666666', 'Ringkasan pengganti.');
select is(
  (select ringkasan from public.percakapan where id = '66666666-6666-6666-6666-666666666666'),
  'Penelepon menanyakan izin edar Paracetamol.',
  'ringkasan pertama tidak ditimpa'
);

select * from finish();
rollback;
