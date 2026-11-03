-- T-F2.3-02 (REQ-7.3, BR-5): policy "Petugas memperbarui materi" hanya memeriksa is_petugas(), tanpa batas kolom,
-- sehingga sesi petugas bisa mengubah judul, rujukan, atau isi materi lewat REST.
-- Dashboard hanya mengubah status (nonaktifkan) dan terindeks (pengindeksan T-F2.2-02).
-- diperbarui_oleh dan diperbarui_pada diisi trigger catat_pemutakhiran_materi; hak kolom hanya dicek pada kolom di SET.
revoke update on public.materi_pengetahuan from authenticated;
grant update (status, terindeks) on public.materi_pengetahuan to authenticated;

-- Belum ada alur yang mengubah potongan; potongan hanya ditambah saat pengindeksan.
revoke update on public.materi_potongan from authenticated;
