# Panduan Dashboard Petugas SIGAP

Status: draf, 4 November 2026. Mencakup UC-03, UC-04, dan UC-07. SRS 2.6 butir 1 meminta panduan PDF untuk UC-03 sampai UC-08; bagian UC-05, UC-06, dan UC-08 beserta tangkapan layar disusun setelah fiturnya selesai di Sprint 3, lalu panduan diekspor ke PDF.

Label tombol, field, dan pesan di panduan ini dikutip dari PRD-rinci Lampiran A dan B. Bila tampilan berbeda dengan panduan, yang berlaku adalah kamus pesan di PRD-rinci.

## 1. Masuk dan keluar (UC-03)

1. Buka halaman `/login`.
2. Isi "Email" dan "Password", lalu tekan "Login".
3. Bila berhasil, sistem menampilkan "Login berhasil!" dan membuka halaman Ringkasan Layanan.

Pesan yang mungkin muncul:

| Pesan | Artinya |
|---|---|
| Login gagal. Semua field harus diisi! | Email atau password masih kosong. |
| Login gagal. Email atau password Anda salah. | Kredensial salah. Sistem tidak membedakan email yang tidak terdaftar dan password yang salah. |
| Akses dikunci sementara. Hubungi administrator. | Login gagal tiga kali berturut-turut (REQ-3.5). Akun tetap ditolak walaupun password benar sampai waktu kunci lewat atau dibuka administrator. |
| Terjadi kesalahan pada sistem. | Layanan autentikasi sedang bermasalah. Coba lagi beberapa saat lagi. |

Akun petugas tidak bisa dibuat sendiri. Kotak informasi di halaman login berbunyi: "Akun dibuat oleh administrator SIGAP. Bila muncul pesan "Akses dikunci sementara. Hubungi administrator.", hubungi administrator melalui ext. 1500533-2."

Sesi berakhir setelah 30 menit tanpa aktivitas (NFR-12), lalu dashboard kembali ke halaman login. Untuk keluar, tekan ikon keluar di bagian bawah sidebar.

## 2. Memantau layanan (UC-04)

Sidebar kiri memuat menu Ringkasan Layanan, Panggilan Berjalan, Tiket Eskalasi, Riwayat Percakapan, Daftar Pengaduan, Basis Pengetahuan, Rekap & Laporan, dan AI Agent. Menu yang fiturnya belum selesai membuka halaman placeholder.

### Ringkasan Layanan

Halaman pertama setelah login. Isinya kartu statistik hari ini (panggilan, dijawab otomatis AI, tiket eskalasi baru, pengaduan selesai), daftar kasus perlu tindak lanjut, jumlah panggilan berjalan, dan persentase pertanyaan per kategori dalam 7 hari terakhir (REQ-4.1).

- Tekan "Buka Kasus" pada sebuah kasus untuk membuka detail pengaduannya (REQ-4.4).
- Bila belum ada data kategori, tampil "Belum ada pertanyaan dalam 7 hari terakhir."
- Bila data gagal diambil, tampil "Data ringkasan gagal dimuat. Muat ulang halaman untuk mencoba lagi."

### Panggilan Berjalan

Daftar panggilan yang sedang aktif: nomor telepon tersamar, jenis layanan, topik, waktu mulai, durasi, dan tahap pemrosesan AI (REQ-4.2). Daftar diperbarui otomatis setiap 5 detik tanpa memuat ulang halaman.

- Bila tidak ada panggilan, tampil "Tidak ada panggilan berjalan saat ini."
- Bila data gagal diambil, tampil "Data panggilan gagal dimuat."

### Tiket Eskalasi

Antrean tiket berisi nomor tiket, ringkasan masalah, jenis kasus, waktu masuk, tautan transkrip, dan status (REQ-4.3).

- Tekan "Lihat Transkrip" untuk membaca percakapan yang memicu tiket. Halaman transkrip menyusul di Sprint 3 (UC-05).
- Tekan "Buka Kasus" untuk membuka detail pengaduan.
- Bila antrean kosong, tampil "Tidak ada kasus yang perlu ditindaklanjuti."
- Bila data gagal diambil, tampil "Data tiket gagal dimuat. Muat ulang halaman untuk mencoba lagi."

### AI Agent

Halaman Pantau AI Agent menampilkan kesehatan komponen AI Voice Agent, latensi respons, dan log pemanggilan tool. Bila belum ada pemanggilan tool, tampil "Belum ada pemanggilan tool."

## 3. Mengelola basis pengetahuan (UC-07)

Buka menu Basis Pengetahuan. Daftar materi bisa dicari menurut judul atau rujukan sumber, dan disaring menurut status.

### Menambah materi

1. Tekan "Tambah Materi".
2. Isi "Judul Materi" dan "Rujukan Sumber". Isi materi dan kategori boleh ditambahkan.
3. Tekan "Simpan".

Pesan yang mungkin muncul:

| Pesan | Artinya |
|---|---|
| Materi siap digunakan sistem. | Materi tersimpan berstatus aktif dan sudah terindeks untuk jawaban CS AI (REQ-7.1). |
| Rujukan sumber wajib diisi. | Materi tanpa rujukan sumber ditolak (REQ-7.2, BR-4). |
| Materi gagal disimpan. Muat ulang halaman untuk mencoba lagi. | Penyimpanan gagal. Materi belum tersimpan. |

### Menonaktifkan materi usang

1. Tekan "Hapus" pada materi yang sudah usang.
2. Sistem meminta konfirmasi: "Tandai "[judul materi]" tidak aktif? Materi tidak dihapus permanen, tetapi tidak lagi dipakai sebagai sumber jawaban."
3. Setelah dikonfirmasi, tampil "Materi ditandai tidak aktif."

Materi tidak pernah dihapus permanen (REQ-7.3, BR-5). Bila gagal, tampil "Materi gagal dinonaktifkan. Muat ulang halaman untuk mencoba lagi."

### Graf pengetahuan

Tekan "Graf Pengetahuan" untuk melihat keterkaitan antarmateri. Pilih sebuah simpul untuk melihat rujukan sumber dan bagian dokumen yang terindeks (REQ-7.4). Bila belum ada materi, tampil "Graf terbentuk setelah ada materi di basis pengetahuan."

## 4. Menyusul di Sprint 3

- UC-05 Membaca Transkrip Percakapan
- UC-06 Menangani Pengaduan
- UC-08 Merekap dan Mengunduh Laporan
