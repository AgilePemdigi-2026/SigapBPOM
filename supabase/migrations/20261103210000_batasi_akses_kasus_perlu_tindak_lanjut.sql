-- UC-04 (REQ-4.1): view kasus_perlu_tindak_lanjut hanya dibaca petugas.
-- View satu tabel tanpa security_invoker dapat di-UPDATE/DELETE otomatis dengan hak owner, sehingga petugas bisa mengubah
-- atau menghapus tiket lewat PostgREST tanpa melewati RLS tiket. Hak tulis bawaan Supabase dicabut seperti panggilan_berjalan.
revoke all on public.kasus_perlu_tindak_lanjut from authenticated;
grant select on public.kasus_perlu_tindak_lanjut to authenticated;
