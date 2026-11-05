-- UC-04 (REQ-4.1, T-F5.1-02): jumlah percakapan per jam untuk panel Beban Panggilan di Ringkasan (Harian, Mingguan, Bulanan).
-- jam adalah awal jam di zona Asia/Jakarta, tanpa zona. Rentangnya mulai awal bulan ini atau enam hari lalu, mana yang lebih
-- awal, jadi paling banyak 31 x 24 = 744 baris, di bawah max_rows PostgREST 1000. Predikat waktu_mulai memakai
-- percakapan_waktu_mulai_idx.
-- Hitungan sama dengan ambil_ringkasan_layanan: total = semua percakapan, dijawab_ai = selesai_ai. Status lain (berjalan,
-- tiket_terbit, dan status yang ditambahkan kemudian) hanya masuk total; dashboard menampilkan sisanya abu-abu.
create or replace view public.beban_panggilan_per_jam
with (security_invoker = false) as
select
  date_trunc('hour', waktu_mulai at time zone 'Asia/Jakarta') as jam,
  count(*)::int as total,
  (count(*) filter (where status_penyelesaian = 'selesai_ai'))::int as dijawab_ai,
  (count(*) filter (where status_penyelesaian = 'dieskalasi'))::int as dieskalasi
from public.percakapan
where waktu_mulai >= least(
    date_trunc('month', now() at time zone 'Asia/Jakarta'),
    date_trunc('day', now() at time zone 'Asia/Jakarta') - interval '6 days'
  ) at time zone 'Asia/Jakarta'
  and (select public.is_petugas())
group by 1;

-- Hanya petugas yang membaca. Hak tulis bawaan Supabase dicabut, dan service_role dicabut agar pembacaannya gagal jelas,
-- bukan kosong diam-diam karena is_petugas() (sama seperti 20261103120100_batasi_akses_panggilan_berjalan).
revoke all on public.beban_panggilan_per_jam from public, anon, authenticated, service_role;
grant select on public.beban_panggilan_per_jam to authenticated;
