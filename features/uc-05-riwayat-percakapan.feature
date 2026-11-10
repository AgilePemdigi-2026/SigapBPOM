# language: id
# Skenario penerimaan UC-05 Membaca Transkrip Percakapan, mengikuti SRS Tabel B.6 dan Tabel 4.5 (REQ-5.1 sampai REQ-5.4,
# NFR-13). Langkahnya memanggil TranskripController dengan penyimpanan tiruan. Penyamaran data pribadi dilakukan view
# ucapan_petugas di basis data (diuji pgTAP), jadi penyimpanan tiruan berisi transkrip dalam bentuk yang dikirim view itu.
Fitur: Membaca transkrip percakapan
  Petugas membaca transkrip lengkap suatu panggilan untuk memeriksa interaksi antara penelepon dan AI Voice Agent,
  lalu mencatat hasil pemeriksaannya. Data pribadi pelapor selalu tampil tersamar.

  Latar Belakang:
    Diketahui petugas sudah masuk ke dashboard SIGAP pada 20-10-2026 pukul 10.00 WIB
    Dan register layanan berisi percakapan:
      | id  | waktu mulai          | jenis            | ringkasan                                                     | status       |
      | c-1 | 2026-10-20T02:15:00Z | pengaduan        | Krim Wajah Glowing, iritasi kulit setelah dua hari pemakaian  | tiket_terbit |
      | c-2 | 2026-10-19T03:00:00Z | informasi_produk | Cek izin edar Susu Formula Sehat, status Berlaku              | selesai_ai   |
      | c-3 | 2026-10-18T04:30:00Z | informasi_produk | Pertanyaan keamanan obat batuk untuk ibu hamil                | dieskalasi   |
    Dan transkrip percakapan "c-1" tersimpan sebagai:
      | detik | pembicara | teks                                                                                                           |
      | 0     | sistem    | Silakan sebutkan nama produk, kronologi kejadian, nama, dan nomor telepon Anda.                                |
      | 6     | penelepon | Krim Wajah Glowing membuat kulit saya iritasi. Nama saya B*** S******, nomor telepon 0812****7890.             |
      | 15    | sistem    | Pengaduan Anda telah dicatat dengan nomor tiket ADU-20261020-0456. Tindak lanjut akan dikirim melalui SMS.     |

  Skenario: Membaca transkrip dan menyimpan catatan pemeriksaan (Basic Path)
    Ketika petugas membuka halaman riwayat percakapan
    Maka daftar percakapan menampilkan:
      | waktu          | jenis            | ringkasan                                                    | status penyelesaian |
      | 20 Okt · 09:15 | Pengaduan        | Krim Wajah Glowing, iritasi kulit setelah dua hari pemakaian | tiket terbit        |
      | 19 Okt · 10:00 | Informasi Produk | Cek izin edar Susu Formula Sehat, status Berlaku             | selesai oleh AI     |
      | 18 Okt · 11:30 | Informasi Produk | Pertanyaan keamanan obat batuk untuk ibu hamil               | dieskalasi          |
    Dan ringkasan periode berisi 3 percakapan, 2 informasi produk, 1 pengaduan produk, dan 1 dieskalasi
    Ketika petugas menekan "Lihat Transkrip" pada percakapan "Krim Wajah Glowing, iritasi kulit setelah dua hari pemakaian"
    Maka halaman "/riwayat-percakapan/detail" terbuka
    Dan TranskripPercakapan menampilkan 3 ucapan berurutan dengan stempel waktu
    Dan RingkasanPercakapan menampilkan "Krim Wajah Glowing, iritasi kulit setelah dua hari pemakaian" dengan status penyelesaian "tiket terbit"
    Dan TranskripPercakapan memuat "0812****7890"
    Dan TranskripPercakapan memuat "B*** S******"
    Dan TranskripPercakapan tidak memuat nomor telepon utuh
    Ketika petugas mengisi "Catatan Pemeriksaan" dengan "Perlu verifikasi ulang data pelapor"
    Dan petugas menekan "Simpan Catatan"
    Maka sistem menampilkan pesan "Catatan pemeriksaan tersimpan."
    Dan catatan pemeriksaan "Perlu verifikasi ulang data pelapor" tersimpan pada percakapan "c-1"

  Skenario: Catatan pemeriksaan kosong (Exception Path 1)
    Diketahui petugas membuka transkrip percakapan "c-1"
    Ketika petugas mengisi "Catatan Pemeriksaan" dengan ""
    Dan petugas menekan "Simpan Catatan"
    Maka sistem menampilkan pesan "Catatan pemeriksaan wajib diisi."
    Dan tidak ada catatan pemeriksaan tersimpan pada percakapan "c-1"
