begin;
select plan(8);

-- 1. Hak akses: anon ditolak
set local role anon;
select throws_ok(
  $$ select public.simpan_pengaduan_tidak_lengkap('00000000-0000-0000-0000-000000000001'::uuid, 'Obat X', null, null, null) $$,
  '42501',
  null,
  'Pengguna anon tidak boleh mengeksekusi simpan_pengaduan_tidak_lengkap'
);

-- 2. Hak akses: authenticated ditolak
set local role authenticated;
select throws_ok(
  $$ select public.simpan_pengaduan_tidak_lengkap('00000000-0000-0000-0000-000000000001'::uuid, 'Obat X', null, null, null) $$,
  '42501',
  null,
  'Pengguna authenticated tidak boleh mengeksekusi simpan_pengaduan_tidak_lengkap'
);

-- 3. Eksekusi lewat service_role
reset role;
set local role service_role;

-- 4. Percakapan tidak ditemukan ditolak (P0002)
select throws_ok(
  $$ select public.simpan_pengaduan_tidak_lengkap('99999999-9999-9999-9999-999999999999'::uuid, 'Obat X', null, null, null) $$,
  'P0002',
  null,
  'Percakapan tidak ditemukan melempar kode P0002'
);

-- Siapkan percakapan uji
insert into public.percakapan (id) values
  ('55555555-5555-5555-5555-555555555555');

-- 5. Panggilan simpan_pengaduan_tidak_lengkap dengan data sebagian (hanya nama produk dan pelapor)
create temporary table uji_tidak_lengkap (
  id uuid
);

insert into uji_tidak_lengkap (id)
values (
  public.simpan_pengaduan_tidak_lengkap(
    '55555555-5555-5555-5555-555555555555'::uuid,
    'Kapsul Pelangsing Herbal',
    null,
    'Dewi Sartika',
    null
  )
);

select ok(
  (select id from uji_tidak_lengkap) is not null,
  'simpan_pengaduan_tidak_lengkap mengembalikan ID pengaduan'
);

-- 5. Status percakapan berubah ke pengaduan_tidak_lengkap (REQ-2.5)
select is(
  (select status_penyelesaian from public.percakapan where id = '55555555-5555-5555-5555-555555555555'),
  'pengaduan_tidak_lengkap'::public.status_penyelesaian,
  'Status penyelesaian percakapan berubah menjadi pengaduan_tidak_lengkap'
);

-- 6. Register pengaduan tersimpan dengan kelengkapan = false
select is(
  (select kelengkapan from public.pengaduan where percakapan_id = '55555555-5555-5555-5555-555555555555'),
  false,
  'Pengaduan tercatat dengan kelengkapan = false'
);

-- 7. Register pengaduan memiliki tiket_id IS NULL
select is(
  (select tiket_id from public.pengaduan where percakapan_id = '55555555-5555-5555-5555-555555555555'),
  null::uuid,
  'Pengaduan tidak lengkap memiliki tiket_id bernilai NULL'
);

-- 8. Kriteria selesai: tidak ada baris tiket yang dibuat
select is(
  (select count(*)::int from public.tiket where percakapan_id = '55555555-5555-5555-5555-555555555555'),
  0,
  'Tidak ada baris tiket yang dibuat untuk pengaduan tidak lengkap'
);

select * from finish();
rollback;
