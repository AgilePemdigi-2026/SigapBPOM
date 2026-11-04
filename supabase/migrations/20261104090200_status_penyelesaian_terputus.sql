-- Entity UC-04: status penyelesaian untuk panggilan yang berakhir tanpa diselesaikan (T-F5.1-01, REQ-4.1).
-- Panggilan terputus tidak dihitung sebagai "Dijawab Otomatis AI". Nilai enum baru tidak boleh dipakai di transaksi yang
-- menambahkannya, jadi berdiri sendiri sebelum 20261104090300 yang memakainya.
alter type public.status_penyelesaian add value if not exists 'terputus';
