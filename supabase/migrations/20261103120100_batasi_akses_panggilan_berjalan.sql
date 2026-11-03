-- UC-04 (T-F5.2-02, REQ-4.2): view panggilan_berjalan hanya untuk petugas terautentikasi.
-- Filter is_petugas() memakai auth.uid() yang kosong untuk service_role, sehingga service_role selalu mendapat daftar kosong
-- tanpa galat. Hak bacanya dicabut agar pembacaan lewat service_role gagal jelas, bukan kosong diam-diam.
revoke all on public.panggilan_berjalan from service_role;
