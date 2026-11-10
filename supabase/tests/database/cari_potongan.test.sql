-- T-F1.3-02 (REQ-1.6, NFR-8): cari_potongan mengurutkan potongan menurut kemiripan dengan vektor kueri dan membuang
-- yang di bawah ambang. Parameter `embedding` sama namanya dengan kolom materi_potongan.embedding, jadi isi fungsi harus
-- merujuk parameternya secara eksplisit; tanpa itu setiap potongan dibandingkan dengan dirinya sendiri (skor selalu 1).
begin;
select plan(3);

-- Vektor satuan pada sumbu ke-n dari 1536 dimensi.
create function pg_temp.sumbu(n int) returns public.vector language sql as $$
  select array_agg(case when i = n then 1 else 0 end order by i)::public.vector from generate_series(1, 1536) i
$$;

insert into public.materi_pengetahuan (id, judul, rujukan_sumber, isi) values
  ('77777777-0000-0000-0000-000000000021', 'Suplemen Kesehatan', 'Peraturan BPOM Nomor 17 Tahun 2019', 'Isi uji'),
  ('77777777-0000-0000-0000-000000000022', 'Label Pangan', 'Peraturan BPOM Nomor 31 Tahun 2018', 'Isi uji');
insert into public.materi_potongan (materi_id, teks, embedding) values
  ('77777777-0000-0000-0000-000000000021', 'potongan suplemen', pg_temp.sumbu(1)),
  ('77777777-0000-0000-0000-000000000022', 'potongan label', pg_temp.sumbu(2));

select results_eq(
  $$ select teks, round(skor::numeric, 3) from public.cari_potongan(pg_temp.sumbu(1), 0.7, 5) $$,
  $$ values ('potongan suplemen', 1.000::numeric) $$,
  'req_1_6 hanya potongan yang mirip dengan kueri yang lolos ambang'
);

select is(
  (select teks from public.cari_potongan(pg_temp.sumbu(2), 0, 1)),
  'potongan label',
  'req_1_6 potongan paling mirip dikembalikan lebih dulu'
);

select is(
  (select count(*)::int from public.cari_potongan(pg_temp.sumbu(3), 0.7, 5)),
  0,
  'nfr_8 kueri yang tidak mirip dengan potongan mana pun tidak mengembalikan kutipan'
);

select * from finish();
rollback;
