-- Tautan dokumen sumber materi, agar petugas bisa membuka rujukan langsung dari halaman Basis Pengetahuan.
-- Boleh kosong untuk materi lama atau materi tanpa dokumen daring; bila diisi harus tautan http(s).
alter table public.materi_pengetahuan
  add column url_sumber text check (url_sumber is null or url_sumber ~* '^https?://');
