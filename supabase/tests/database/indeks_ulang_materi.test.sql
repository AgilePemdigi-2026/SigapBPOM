-- T-F2.2-02 (REQ-7.1, REQ-7.4, BR-4): kolom url_sumber dan urutan, serta penandaan terindeks oleh indeks ulang.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000111', 'petugas.awal@halobpom.go.id'),
  ('00000000-0000-0000-0000-000000000112', 'petugas.indeks@halobpom.go.id');
insert into public.petugas (id, nama) values
  ('00000000-0000-0000-0000-000000000111', 'Petugas Awal'),
  ('00000000-0000-0000-0000-000000000112', 'Petugas Indeks');
insert into public.materi_pengetahuan (id, judul, rujukan_sumber, isi, diperbarui_oleh, diperbarui_pada)
values (
  '77777777-0000-0000-0000-000000000011', 'Acuan Label Gizi', 'Perka BPOM No. 9 Tahun 2016', 'Isi materi uji',
  '00000000-0000-0000-0000-000000000111', '2016-01-01T00:00:00+07:00'
);

select has_column('public', 'materi_pengetahuan', 'url_sumber', 'br_4 materi menyimpan tautan url_sumber');

select throws_ok(
  $$ insert into public.materi_pengetahuan (judul, rujukan_sumber, isi, url_sumber)
     values ('Materi Uji', 'Peraturan BPOM Uji', 'Isi', 'javascript:alert(1)') $$,
  '23514',
  null,
  'br_4 url_sumber hanya menerima tautan http(s)'
);

select has_column('public', 'materi_potongan', 'urutan', 'req_7_4 potongan materi punya urutan');

set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000112';

update public.materi_pengetahuan set terindeks = true where id = '77777777-0000-0000-0000-000000000011';

select results_eq(
  $$ select terindeks, diperbarui_oleh, diperbarui_pada from public.materi_pengetahuan
     where id = '77777777-0000-0000-0000-000000000011' $$,
  $$ values (true, '00000000-0000-0000-0000-000000000111'::uuid, '2016-01-01T00:00:00+07:00'::timestamptz) $$,
  'req_7_1 penandaan terindeks tidak mengubah tanggal dan pengubah pemutakhiran'
);

update public.materi_pengetahuan set status = 'tidak_aktif' where id = '77777777-0000-0000-0000-000000000011';

select is(
  (select diperbarui_pada from public.materi_pengetahuan where id = '77777777-0000-0000-0000-000000000011'),
  now(),
  'req_7_3 penonaktifan tetap mencatat waktu pemutakhiran'
);

select is(
  (select diperbarui_oleh from public.materi_pengetahuan where id = '77777777-0000-0000-0000-000000000011'),
  '00000000-0000-0000-0000-000000000112'::uuid,
  'req_7_3 penonaktifan tetap mencatat petugas pemutakhiran'
);

select * from finish();
rollback;
