-- T-F2.3-02 (REQ-7.3, BR-5): sesi petugas hanya boleh mengubah status dan terindeks materi.
begin;
select plan(5);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000073', 'petugas.materi@halobpom.go.id');
insert into public.petugas (id, nama)
values ('00000000-0000-0000-0000-000000000073', 'Petugas Materi');
insert into public.materi_pengetahuan (id, judul, rujukan_sumber, isi)
values ('77777777-0000-0000-0000-000000000001', 'Materi Uji', 'Peraturan BPOM Uji', 'Isi materi uji');
insert into public.materi_potongan (materi_id, teks)
values ('77777777-0000-0000-0000-000000000001', 'Potongan uji');

set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000073';

select throws_ok(
  $$ update public.materi_pengetahuan set judul = 'Judul palsu' where id = '77777777-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'req_7_3 petugas tidak boleh mengubah judul materi'
);

select throws_ok(
  $$ update public.materi_potongan set teks = 'Teks palsu' where materi_id = '77777777-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'req_7_3 petugas tidak boleh mengubah potongan materi'
);

select lives_ok(
  $$ update public.materi_pengetahuan set status = 'tidak_aktif' where id = '77777777-0000-0000-0000-000000000001' $$,
  'req_7_3 petugas boleh menonaktifkan materi'
);

select is(
  (select status::text from public.materi_pengetahuan where id = '77777777-0000-0000-0000-000000000001'),
  'tidak_aktif',
  'br_5 materi tidak aktif tetap tersimpan'
);

select is(
  (select diperbarui_oleh from public.materi_pengetahuan where id = '77777777-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-000000000073'::uuid,
  'req_7_3 pengubah diisi trigger dari sesi petugas'
);

select * from finish();
rollback;
