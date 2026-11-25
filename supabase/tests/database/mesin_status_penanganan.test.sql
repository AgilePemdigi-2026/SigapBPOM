-- Migrasi 20261117100000: urutan tahap penanganan UC-06 dan tgl_selesai untuk rekap UC-08 (REQ-8.1).
begin;
select plan(21);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000098', 'petugas.mesin@halobpom.go.id')
on conflict (id) do nothing;
insert into public.petugas (id, nama, hak_ekspor)
values ('00000000-0000-0000-0000-000000000098', 'Petugas Mesin Status', true)
on conflict (id) do nothing;

set local role service_role;
insert into public.percakapan (id, jenis_interaksi, status_penyelesaian, waktu_mulai)
select ('88888888-0000-0000-0000-0000000002' || n)::uuid, 'pengaduan', 'tiket_terbit', '2026-08-28 10:00:00+07'
from generate_series(10, 14) n;
insert into public.tiket (id, no_tiket, jenis, percakapan_id, status, tgl_terbit, ringkasan)
select ('99999999-0000-0000-0000-0000000002' || n)::uuid, 'ADU-20260828-02' || n, 'pengaduan',
       ('88888888-0000-0000-0000-0000000002' || n)::uuid, 'belum_ditelaah', '2026-08-28 10:00:00+07', 'Pengaduan ' || n
from generate_series(10, 14) n;

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000098';

-- Tanggapan sebelum telaah ditolak.
select throws_ok($$ select public.simpan_tanggapan('ADU-20260828-0210', 'Tanggapan dini') $$, 'SG409', null,
  'Tanggapan untuk tiket Belum Ditelaah ditolak');
-- Jadwal tanpa telaah Perlu Pemeriksaan Lapangan ditolak.
select throws_ok($$ select public.simpan_jadwal_pemeriksaan('ADU-20260828-0210', '2026-09-01'::date, 'BBPOM di Surabaya') $$, '55000', null,
  'Jadwal untuk tiket Belum Ditelaah ditolak');
select lives_ok($$ select public.simpan_telaah('ADU-20260828-0210', 'Telaah Dokumen', 'Cek label') $$, 'Telaah dokumen tersimpan');
select throws_ok($$ select public.simpan_jadwal_pemeriksaan('ADU-20260828-0210', '2026-09-01'::date, 'BBPOM di Surabaya') $$, '55000', null,
  'Jadwal setelah telaah dokumen ditolak');

-- Alternative Path 2: tanggapan baru boleh setelah jadwal tersimpan.
select lives_ok($$ select public.simpan_telaah('ADU-20260828-0211', 'Perlu Pemeriksaan Lapangan', 'Cek sarana') $$, 'Telaah pemeriksaan lapangan tersimpan');
select throws_ok($$ select public.simpan_tanggapan('ADU-20260828-0211', 'Tanggapan tanpa jadwal') $$, 'SG409', null,
  'Tanggapan sebelum jadwal pemeriksaan ditolak');
select lives_ok($$ select public.simpan_jadwal_pemeriksaan('ADU-20260828-0211', '2026-09-01'::date, 'BBPOM di Surabaya') $$,
  'Jadwal setelah telaah Perlu Pemeriksaan Lapangan diterima');
select throws_ok($$ select public.simpan_telaah('ADU-20260828-0211', 'Bukan Kewenangan BPOM', 'Ubah') $$, '55000', null,
  'Tiket Menunggu Pemeriksaan tidak dapat ditelaah ulang');
select lives_ok($$ select public.simpan_tanggapan('ADU-20260828-0211', 'Hasil pemeriksaan: sarana diberi peringatan.') $$,
  'Tanggapan setelah jadwal pemeriksaan diterima');
select throws_ok($$ select public.simpan_jadwal_pemeriksaan('ADU-20260828-0211', '2026-09-02'::date, 'BBPOM di Surabaya') $$, '55000', null,
  'Jadwal tidak dapat memundurkan tiket Tanggapan Disusun');

-- Tutup tiket mencatat waktu penutupan (pelapor dihubungi lebih dulu, ADR 0006).
select lives_ok($$ select public.tandai_sudah_dihubungi('ADU-20260828-0211') $$, 'Pelapor ditandai sudah dihubungi');
select is(public.tutup_tiket('ADU-20260828-0211'), 'selesai'::public.status_tiket, 'Tiket bertanggapan dapat ditutup');
reset role;
select ok((select tgl_selesai is not null from public.tiket where no_tiket = 'ADU-20260828-0211'),
  'tutup_tiket mengisi tgl_selesai');

-- Tiket Sedang Ditelaah tanpa tanggapan tetap ditolak dengan pesan BR-2.
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000098';
select throws_ok($$ select public.tutup_tiket('ADU-20260828-0210') $$, 'SGBR2',
  'Tiket tidak dapat ditutup. Susun tanggapan terlebih dahulu.', 'Tutup tanpa tanggapan ditolak sesuai BR-2');

-- REQ-8.1: pengaduan terbit Agustus yang ditutup September dihitung di September, bukan Agustus.
reset role;
update public.tiket set tgl_selesai = '2026-09-03 09:00:00+07' where no_tiket = 'ADU-20260828-0211';
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000098';
select is(((public.rekap_layanan('2026-08-28'::date, '2026-08-31'::date) -> 'total' ->> 'pengaduan_selesai')::int), 0,
  'Pengaduan tidak dihitung selesai pada periode terbitnya');
select is(((public.rekap_layanan('2026-09-01'::date, '2026-09-07'::date) -> 'total' ->> 'pengaduan_selesai')::int), 1,
  'Pengaduan dihitung selesai pada periode penutupannya');
select ok(not has_function_privilege('authenticated', 'public.tindak_lanjut_terakhir(uuid)', 'execute'),
  'Fungsi pembantu tindak_lanjut_terakhir tidak dapat dipanggil langsung oleh authenticated');

-- Tiket eskalasi tidak ditangani lewat UC-06.
reset role;
set local role service_role;
insert into public.percakapan (id, jenis_interaksi, status_penyelesaian, waktu_mulai)
values ('88888888-0000-0000-0000-000000000299', 'informasi_produk', 'dieskalasi', now());
insert into public.tiket (id, no_tiket, jenis, percakapan_id, status, tgl_terbit, ringkasan)
values ('99999999-0000-0000-0000-000000000299', 'ESK-20260828-0299', 'eskalasi', '88888888-0000-0000-0000-000000000299', 'belum_ditelaah', now(), 'Eskalasi');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000000098';
select throws_ok($$ select public.simpan_telaah('ESK-20260828-0299', 'Telaah Dokumen', 'x') $$, '55000', null,
  'Tiket eskalasi tidak dapat ditelaah lewat UC-06');
select throws_ok($$ select public.tutup_tiket('ESK-20260828-0299') $$, 'SG409', null,
  'Tiket eskalasi tidak dapat ditutup lewat UC-06');

-- Trigger mengisi tgl_selesai dari jalur mana pun, dan tidak menimpa nilai yang sudah ada.
reset role;
update public.tiket set status = 'selesai' where no_tiket = 'ADU-20260828-0212';
select ok((select tgl_selesai is not null from public.tiket where no_tiket = 'ADU-20260828-0212'),
  'Trigger mengisi tgl_selesai saat status diubah langsung menjadi selesai');
select is((select tgl_selesai from public.tiket where no_tiket = 'ADU-20260828-0211'), '2026-09-03 09:00:00+07'::timestamptz,
  'Trigger tidak menimpa tgl_selesai yang sudah terisi');

select * from finish();
rollback;
