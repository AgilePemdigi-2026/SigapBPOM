begin;
select plan(10);

-- 1. Hak akses: anon ditolak
set local role anon;
select throws_ok(
  $$ select public.terbitkan_tiket_pengaduan('00000000-0000-0000-0000-000000000001'::uuid, 'Obat X', 'Kronologi', 'Budi', '081234567890') $$,
  '42501',
  null,
  'Pengguna anon tidak boleh mengeksekusi terbitkan_tiket_pengaduan'
);

-- 2. Hak akses: authenticated ditolak
set local role authenticated;
select throws_ok(
  $$ select public.terbitkan_tiket_pengaduan('00000000-0000-0000-0000-000000000001'::uuid, 'Obat X', 'Kronologi', 'Budi', '081234567890') $$,
  '42501',
  null,
  'Pengguna authenticated tidak boleh mengeksekusi terbitkan_tiket_pengaduan'
);

-- 3. Eksekusi lewat service_role
reset role;
set local role service_role;

-- Siapkan dua percakapan uji
insert into public.percakapan (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

-- 4. Validasi data: nama produk kosong ditolak (BR-1)
select throws_ok(
  $$ select public.terbitkan_tiket_pengaduan('11111111-1111-1111-1111-111111111111'::uuid, '', 'Reaksi alergi', 'Ahmad', '081234567890') $$,
  '22023',
  'nama produk wajib diisi',
  'Nama produk kosong ditolak dengan kode 22023'
);

-- 5. Validasi data: nomor telepon tidak valid ditolak (BR-1)
select throws_ok(
  $$ select public.terbitkan_tiket_pengaduan('11111111-1111-1111-1111-111111111111'::uuid, 'Sirup Sehat', 'Reaksi alergi', 'Ahmad', '0211234567') $$,
  '22023',
  'nomor telepon tidak valid',
  'Nomor telepon bukan 08 ditolak dengan kode 22023'
);

-- 6. Terbitkan tiket pengaduan pertama
create temporary table uji_tiket (
  putaran int primary key,
  nomor_tiket text
);

insert into uji_tiket (putaran, nomor_tiket)
values (
  1,
  public.terbitkan_tiket_pengaduan(
    '11111111-1111-1111-1111-111111111111'::uuid,
    'Sirup Batuk Herbal X',
    'Anak mengalami ruam merah setelah minum sirup 2 sendok teh',
    'Ahmad Fauzi',
    '081234567890'
  )
);

select matches(
  (select nomor_tiket from uji_tiket where putaran = 1),
  '^ADU-[0-9]{8}-[0-9]{4}$',
  'Nomor tiket pengaduan terbit sesuai pola ADU-YYYYMMDD-NNNN'
);

-- 7. Percakapan berstatus tiket_terbit dan jenis pengaduan
select is(
  (select status_penyelesaian from public.percakapan where id = '11111111-1111-1111-1111-111111111111'),
  'tiket_terbit'::public.status_penyelesaian,
  'Status penyelesaian percakapan berubah menjadi tiket_terbit'
);

-- 8. Pengaduan lengkap tercatat pada register pengaduan
select is(
  (select kelengkapan from public.pengaduan where percakapan_id = '11111111-1111-1111-1111-111111111111'),
  true,
  'Pengaduan lengkap tercatat dengan kelengkapan = true'
);

-- 9. Tiket pengaduan tercatat dengan status belum_ditelaah dan jenis pengaduan
select is(
  (select status from public.tiket where percakapan_id = '11111111-1111-1111-1111-111111111111'),
  'belum_ditelaah'::public.status_tiket,
  'Tiket pengaduan diterbitkan dengan status belum_ditelaah'
);

-- 10. Satu percakapan paling banyak satu tiket: penerbitan kedua pada percakapan yang sama ditolak (23505)
select throws_ok(
  $$ select public.terbitkan_tiket_pengaduan(
    '11111111-1111-1111-1111-111111111111'::uuid,
    'Sirup Batuk Herbal X',
    'Kronologi kedua',
    'Ahmad Fauzi',
    '081234567890'
  ) $$,
  '23505',
  null,
  'Satu percakapan paling banyak satu tiket (tiket_percakapan_id_key ditolak 23505)'
);

-- 11. Dua penerbitan menghasilkan nomor berurutan unik
insert into uji_tiket (putaran, nomor_tiket)
values (
  2,
  public.terbitkan_tiket_pengaduan(
    '22222222-2222-2222-2222-222222222222'::uuid,
    'Salep Kulit Y',
    'Kulit gatal dan melepuh setelah pemakaian',
    'Siti Aminah',
    '081987654321'
  )
);

select ok(
  (
    select substring((select nomor_tiket from uji_tiket where putaran = 2) from 14)::int
         - substring((select nomor_tiket from uji_tiket where putaran = 1) from 14)::int = 1
  ),
  'Dua penerbitan menghasilkan nomor urut berurutan unik'
);

select * from finish();
rollback;
