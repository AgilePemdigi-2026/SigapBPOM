-- UC-04 (T-F5.2-02, REQ-4.2): view panggilan_berjalan hanya untuk petugas terautentikasi.
-- Filter is_petugas() memakai auth.uid() yang kosong untuk service_role, sehingga service_role selalu mendapat daftar kosong
-- tanpa galat. Hak bacanya dicabut agar pembacaan lewat service_role gagal jelas, bukan kosong diam-diam.
revoke all on public.panggilan_berjalan from service_role;
-- authenticated hanya membaca: cabut hak tulis bawaan Supabase (insert, update, delete, truncate, references, trigger).
revoke all on public.panggilan_berjalan from authenticated;
grant select on public.panggilan_berjalan to authenticated;
