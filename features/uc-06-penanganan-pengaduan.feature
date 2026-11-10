# language: id
# Skenario penerimaan UC-06 Menangani Pengaduan, mengikuti SRS Tabel B.7 dan Tabel 4.6 (REQ-6.1 sampai REQ-6.6, BR-2, BR-3).
# Langkahnya memanggil PenangananController dengan PenyimpananPenangananTiruan, yang menjalankan mesin status PRD-rinci
# F-06 seperti RPC penanganan. Daftar dan detail pengaduan dibaca PemantauanLayananController dari data tiruan yang sama,
# sehingga StatusPengaduan menampilkan status sesudah setiap aksi.
# Skenario @belum-tersedia butuh bagian yang belum dibuat dan tidak ikut `npm run test:bdd`.
Fitur: Menangani pengaduan
  Petugas menangani pengaduan produk mulai dari penelaahan, penyusunan tanggapan resmi, hingga penutupan tiket dan
  pengiriman notifikasi kepada pelapor.

  Latar Belakang:
    Diketahui petugas sudah masuk ke dashboard SIGAP
    Dan terdapat pengaduan:
      | nomor tiket       | produk             | ringkasan                                      | status         |
      | ADU-20261020-0456 | Krim Wajah Glowing | Iritasi kulit setelah dua hari pemakaian       | Belum Ditelaah |
      | ADU-20261019-0455 | Jamu Pegal Linu    | Diduga mengandung bahan kimia obat             | Selesai        |

  Skenario: Hasil telaah tersimpan (Basic Path)
    Ketika petugas membuka halaman daftar pengaduan
    Maka daftar pengaduan menampilkan:
      | nomor tiket       | status         |
      | ADU-20261020-0456 | Belum Ditelaah |
      | ADU-20261019-0455 | Selesai        |
    Ketika petugas menekan "Telaah" pada pengaduan berstatus "Belum Ditelaah"
    Maka halaman "/pengaduan/detail" terbuka
    Dan detail pengaduan "ADU-20261020-0456" untuk produk "Krim Wajah Glowing" ditampilkan
    Dan pilihan "Tindak Lanjut" berisi "Telaah Dokumen", "Perlu Pemeriksaan Lapangan", dan "Bukan Kewenangan BPOM"
    Ketika petugas memilih "Telaah Dokumen" pada pilihan "Tindak Lanjut"
    Dan petugas mengisi "Catatan Tindak Lanjut" dengan "Label produk tidak mencantumkan nomor izin edar."
    Dan petugas menekan "Simpan Telaah"
    Maka sistem menampilkan pesan "Hasil telaah tersimpan."
    Dan StatusPengaduan menampilkan "Sedang Ditelaah"

  Skenario: Tanggapan resmi tersimpan (Basic Path)
    Diketahui petugas membuka detail pengaduan "ADU-20261020-0456" berstatus "Sedang Ditelaah"
    Ketika petugas mengisi "Tanggapan" dengan "Produk telah ditelaah dan pelaku usaha diberi peringatan tertulis."
    Dan petugas menekan "Simpan Tanggapan"
    Maka sistem menampilkan pesan "Tanggapan tersimpan."
    Dan StatusPengaduan menampilkan "Tanggapan Disusun"

  Skenario: Tiket ditutup (Basic Path)
    Diketahui petugas membuka detail pengaduan "ADU-20261020-0456" berstatus "Tanggapan Disusun"
    Ketika petugas menekan "Tutup Tiket"
    Maka sistem menampilkan pesan "Tiket ditutup."
    Dan StatusPengaduan menampilkan "Selesai"

  Skenario: Pengaduan di luar kewenangan BPOM (Alternative Path 1)
    Diketahui petugas membuka detail pengaduan "ADU-20261020-0456" berstatus "Belum Ditelaah"
    Ketika petugas memilih "Bukan Kewenangan BPOM" pada pilihan "Tindak Lanjut"
    Dan petugas mengisi "Catatan Tindak Lanjut" dengan "Produk berupa alat elektronik, bukan kewenangan BPOM."
    Dan petugas menekan "Simpan Telaah"
    Maka sistem menampilkan pesan "Pengaduan diteruskan ke instansi lain."
    Dan StatusPengaduan menampilkan "Diteruskan ke Instansi Lain"
    Dan pengaduan tidak dapat dilanjutkan ke tahap berikutnya

  Skenario: Pengaduan perlu pemeriksaan lapangan (Alternative Path 2)
    Diketahui petugas membuka detail pengaduan "ADU-20261020-0456" berstatus "Belum Ditelaah"
    Ketika petugas memilih "Perlu Pemeriksaan Lapangan" pada pilihan "Tindak Lanjut"
    Dan petugas mengisi "Catatan Tindak Lanjut" dengan "Perlu pemeriksaan sarana produksi."
    Dan petugas menekan "Simpan Telaah"
    Maka sistem menampilkan formulir jadwal pemeriksaan
    Ketika petugas mengisi "Tanggal Pemeriksaan" dengan "15-10-2026"
    Dan petugas memilih "Balai Besar POM di Surabaya" pada pilihan "Unit Pelaksana"
    Dan petugas menekan "Simpan Jadwal"
    Maka sistem menampilkan pesan "Jadwal pemeriksaan tersimpan."
    Dan StatusPengaduan menampilkan "Menunggu Pemeriksaan"
    Ketika petugas mengisi "Tanggapan" dengan "Hasil pemeriksaan sarana: produksi tidak memenuhi CPKB, izin edar dievaluasi."
    Dan petugas menekan "Simpan Tanggapan"
    Maka sistem menampilkan pesan "Tanggapan tersimpan."
    Dan StatusPengaduan menampilkan "Tanggapan Disusun"
    Ketika petugas menekan "Tutup Tiket"
    Maka sistem menampilkan pesan "Tiket ditutup."
    Dan StatusPengaduan menampilkan "Selesai"

  Skenario: Menutup tiket tanpa tanggapan tersimpan (Exception Path 1)
    Diketahui petugas membuka detail pengaduan "ADU-20261020-0456" berstatus "Sedang Ditelaah"
    Ketika petugas menekan "Tutup Tiket"
    Maka sistem menampilkan pesan "Tiket tidak dapat ditutup. Susun tanggapan terlebih dahulu."
    Dan StatusPengaduan menampilkan "Sedang Ditelaah"

  # Halaman detail pengaduan dengan StepperPenanganan (#101) belum dibuat, dan belum ada control yang menyusun tahapannya.
  @belum-tersedia
  Skenario: StepperPenanganan menampilkan tahapan penanganan (Basic Path langkah 4)
    Diketahui petugas membuka detail pengaduan "ADU-20261020-0456" berstatus "Sedang Ditelaah"
    Maka StepperPenanganan menampilkan tahap "Telaah", "Jadwal Pemeriksaan", "Susun Tanggapan", dan "Tutup Tiket"
    Dan tahap "Susun Tanggapan" aktif

  # Pengiriman SMS dari notifikasi yang diantrekan RPC tutup_tiket (T-F7.3-01) belum dibuat.
  @belum-tersedia
  Skenario: SMS tindak lanjut terkirim kepada pelapor (Basic Path langkah 16)
    Diketahui petugas membuka detail pengaduan "ADU-20261020-0456" berstatus "Tanggapan Disusun"
    Ketika petugas menekan "Tutup Tiket"
    Maka SMS tindak lanjut tiket "ADU-20261020-0456" terkirim kepada pelapor
