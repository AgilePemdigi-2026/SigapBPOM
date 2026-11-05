-- REQ-4.1, REQ-4.2, NFR-13 (T-F5.1-01, T-F5.2-02, T-F5.3-01): panggilan tetap aktif sampai waktu_selesai terisi, status
-- hasil tidak ditimpa saat ditutup, panggilan tanpa jawaban menjadi terputus, penyapuan terjadwal, kronologi tersamar.
-- Pemeriksaan per baris atau berupa selisih, jadi tidak bergantung pada isi basis data lokal.
begin;
select plan(18);

-- Petugas uji dengan role bawaan tes, seperti panggilan_aktif.test.sql
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000076', 'petugas.penutupan@halobpom.go.id')
on conflict (id) do nothing;
insert into public.petugas (id, nama) values ('00000000-0000-0000-0000-000000000076', 'Petugas Penutupan')
on conflict (id) do nothing;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000076';

-- 1. REQ-4.2: tiket pengaduan, pengaduan tidak lengkap, dan tiket eskalasi tercatat saat penelepon masih tersambung
set local role service_role;
select public.laporkan_panggilan_aktif('c0000000-0000-0000-0000-000000000001'::uuid, 'pengaduan', 'Pengaduan produk', 'mendengar');
select public.laporkan_panggilan_aktif('c0000000-0000-0000-0000-000000000002'::uuid, 'pengaduan', 'Pengaduan produk', 'mendengar');
select public.laporkan_panggilan_aktif('c0000000-0000-0000-0000-000000000003'::uuid, 'informasi_produk', 'Eskalasi ke petugas', 'memproses');
select public.terbitkan_tiket_pengaduan('c0000000-0000-0000-0000-000000000001'::uuid, 'Krim Wajah Glowing',
  'Saya Budi Santoso, hubungi 0812 3456 7890. Kulit iritasi setelah dua hari.', 'Budi Santoso', '081234567890');
select public.simpan_pengaduan_tidak_lengkap('c0000000-0000-0000-0000-000000000002'::uuid, 'Obat X', null, null, null);
select public.terbitkan_tiket_eskalasi('c0000000-0000-0000-0000-000000000003'::uuid, '081298765432', 'Pertanyaan dosis');
select public.laporkan_panggilan_aktif(id, null, null, 'menjawab')
from unnest(array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
                  'c0000000-0000-0000-0000-000000000003']::uuid[]) id;

reset role;
set local role authenticated;
select results_eq(
  $$ select percakapan_id::text, tahap_ai from public.panggilan_berjalan where percakapan_id::text like 'c0000000-%' order by 1 $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'::text, 'menjawab'::text),
            ('c0000000-0000-0000-0000-000000000002', 'menjawab'),
            ('c0000000-0000-0000-0000-000000000003', 'menjawab') $$,
  'REQ-4.2: panggilan yang tiket atau pengaduannya sudah tercatat tetap aktif dengan tahap terbaru'
);

reset role;
set local role service_role;
select is(
  (select bool_and(public.akhiri_panggilan_aktif(id))
   from unnest(array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
                     'c0000000-0000-0000-0000-000000000003']::uuid[]) id),
  true, 'REQ-4.2: panggilan yang statusnya sudah ditetapkan tetap bisa ditutup'
);
-- heartbeat yang terlambat tidak membuka kembali panggilan yang sudah ditutup
select public.laporkan_panggilan_aktif(id, null, null, 'menjawab')
from unnest(array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
                  'c0000000-0000-0000-0000-000000000003']::uuid[]) id;
select results_eq(
  $$ select id::text, status_penyelesaian::text, waktu_selesai is not null, tahap_ai
     from public.percakapan where id::text like 'c0000000-%' order by 1 $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'::text, 'tiket_terbit'::text, true, null::text),
            ('c0000000-0000-0000-0000-000000000002', 'pengaduan_tidak_lengkap', true, null),
            ('c0000000-0000-0000-0000-000000000003', 'dieskalasi', true, null) $$,
  'REQ-4.2: menutup panggilan mengisi waktu selesai tanpa menimpa status hasil, dan heartbeat terlambat tidak membukanya lagi'
);

reset role;
set local role authenticated;
select is(
  (select count(*)::int from public.panggilan_berjalan where percakapan_id::text like 'c0000000-%'),
  0, 'REQ-4.2: panggilan yang sudah ditutup hilang dari daftar aktif'
);

-- 2. REQ-4.1: hanya panggilan yang dijawab AI dihitung "Dijawab Otomatis AI"
reset role;
set local role service_role;
select public.laporkan_panggilan_aktif('d0000000-0000-0000-0000-000000000001'::uuid, 'informasi_produk', 'Informasi produk', 'memproses');
select public.laporkan_panggilan_aktif('d0000000-0000-0000-0000-000000000001'::uuid, null, null, 'menjawab');
select public.laporkan_panggilan_aktif('d0000000-0000-0000-0000-000000000002'::uuid, null, null, 'mendengar');
select public.laporkan_panggilan_aktif('d0000000-0000-0000-0000-000000000002'::uuid, 'informasi_produk', 'Informasi produk', 'memproses');
select public.laporkan_panggilan_aktif('d0000000-0000-0000-0000-000000000003'::uuid, 'pengaduan', 'Pengaduan produk', 'menjawab');

reset role;
set local role authenticated;
select set_config('tes.kpi_awal', (select jawaban_otomatis_ai::text from public.ringkasan_statistik_layanan), true);

reset role;
set local role service_role;
select public.akhiri_panggilan_aktif(id)
from unnest(array['d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
                  'd0000000-0000-0000-0000-000000000003']::uuid[]) id;
select results_eq(
  $$ select id::text, status_penyelesaian::text from public.percakapan where id::text like 'd0000000-%' order by 1 $$,
  $$ values ('d0000000-0000-0000-0000-000000000001'::text, 'selesai_ai'::text),
            ('d0000000-0000-0000-0000-000000000002', 'terputus'),
            ('d0000000-0000-0000-0000-000000000003', 'terputus') $$,
  'REQ-4.1: panggilan yang dijawab AI menjadi selesai_ai; tanpa jawaban atau pengaduan tanpa hasil menjadi terputus'
);

reset role;
set local role authenticated;
select is(
  (select jawaban_otomatis_ai from public.ringkasan_statistik_layanan) - current_setting('tes.kpi_awal')::int,
  1, 'REQ-4.1: KPI Dijawab Otomatis AI tidak menghitung panggilan terputus'
);

-- 3. REQ-4.2: penyapuan panggilan yatim terjadwal dan memakai aturan status yang sama
reset role;
select is(
  (select schedule from cron.job where jobname = 'tutup-panggilan-yatim'),
  '* * * * *', 'REQ-4.2: penyapuan panggilan yatim dijadwalkan pg_cron tiap menit'
);
select matches(
  (select command from cron.job where jobname = 'tutup-panggilan-yatim'),
  'public\.tutup_panggilan_yatim\(\)', 'REQ-4.2: jadwal pg_cron menjalankan tutup_panggilan_yatim'
);

set local role service_role;
insert into public.percakapan (id, waktu_mulai, jenis_interaksi, status_penyelesaian, dijawab_ai, heartbeat_terakhir) values
  ('e0000000-0000-0000-0000-000000000001', now() - interval '10 minutes', 'informasi_produk', 'berjalan', false, now() - interval '5 minutes'),
  ('e0000000-0000-0000-0000-000000000002', now() - interval '10 minutes', 'informasi_produk', 'berjalan', true, now() - interval '5 minutes'),
  ('e0000000-0000-0000-0000-000000000003', now() - interval '10 minutes', 'pengaduan', 'berjalan', true, now() - interval '5 minutes'),
  ('e0000000-0000-0000-0000-000000000004', now() - interval '10 minutes', 'pengaduan', 'tiket_terbit', true, now() - interval '5 minutes'),
  ('e0000000-0000-0000-0000-000000000005', now() - interval '10 minutes', 'informasi_produk', 'berjalan', true, now());
select public.tutup_panggilan_yatim();
select results_eq(
  $$ select id::text, status_penyelesaian::text, waktu_selesai = heartbeat_terakhir
     from public.percakapan where id::text like 'e0000000-%' order by 1 $$,
  $$ values ('e0000000-0000-0000-0000-000000000001'::text, 'terputus'::text, true),
            ('e0000000-0000-0000-0000-000000000002', 'selesai_ai', true),
            ('e0000000-0000-0000-0000-000000000003', 'terputus', true),
            ('e0000000-0000-0000-0000-000000000004', 'tiket_terbit', true),
            ('e0000000-0000-0000-0000-000000000005', 'berjalan', null::boolean) $$,
  'REQ-4.1, REQ-4.2: penyapuan menutup panggilan basi, termasuk yang bertiket, dengan aturan status akhiri; panggilan segar tidak disentuh'
);

-- 4. NFR-13: nama dan nomor pelapor di kronologi tersamar untuk petugas
reset role;
set local role authenticated;
select results_eq(
  $$ select kronologi, ringkasan from public.detail_pengaduan_tiket where percakapan_id = 'c0000000-0000-0000-0000-000000000001' $$,
  $$ values ('Saya B*** S******, hubungi 0812****7890. Kulit iritasi setelah dua hari.'::text,
             'Saya B*** S******, hubungi 0812****7890. Kulit iritasi setelah dua hari.'::text) $$,
  'NFR-13: kronologi dan ringkasan di detail pengaduan menyamarkan nama dan nomor telepon pelapor'
);
select is(
  (select ringkasan from public.antrean_tiket_petugas where percakapan_id = 'c0000000-0000-0000-0000-000000000001'),
  'Saya B*** S******, hubungi 0812****7890. Kulit iritasi setelah dua hari.',
  'NFR-13: ringkasan tiket di antrean petugas tersamar'
);
select is(
  (select ringkasan from public.tiket where percakapan_id = 'c0000000-0000-0000-0000-000000000001'),
  'Saya B*** S******, hubungi 0812****7890. Kulit iritasi setelah dua hari.',
  'NFR-13: ringkasan yang dibaca petugas langsung dari tabel tiket tersamar'
);

reset role;
select is(
  (select kronologi from public.pengaduan where percakapan_id = 'c0000000-0000-0000-0000-000000000001'),
  'Saya Budi Santoso, hubungi 0812 3456 7890. Kulit iritasi setelah dua hari.',
  'NFR-13: register pengaduan tetap menyimpan kronologi asli'
);
select is(
  public.samarkan_teks_pelapor('Hubungi +62 812-3456-7890 ya.', null),
  'Hubungi 0812****7890 ya.', 'NFR-13: nomor berawalan +62 disamarkan dalam format 0812****7890'
);
select is(
  public.samarkan_teks_pelapor('Nomor izin edar DBL0812345678A1 di kemasan, nomor tiket ADU-20261108-0812, jam 08.30.', null),
  'Nomor izin edar DBL0812345678A1 di kemasan, nomor tiket ADU-20261108-0812, jam 08.30.',
  'NFR-13: nomor izin edar, nomor tiket, dan jam tidak dianggap nomor telepon'
);
select is(public.samarkan_teks_pelapor(null, 'Budi'), null, 'NFR-13: kronologi kosong tetap kosong');
select is(
  public.samarkan_teks_pelapor('Budi 081234567890', null),
  'Budi 0812****7890', 'NFR-13: tanpa nama pelapor, nomor telepon tetap disamarkan'
);
select is(
  public.samarkan_teks_pelapor('budi dan Budiman, kata Al', 'Al Budi'),
  'B*** dan Budiman, kata Al', 'NFR-13: kata nama disamarkan utuh tanpa membedakan huruf besar; kata lain dan nama pendek tetap'
);

select * from finish();
rollback;
