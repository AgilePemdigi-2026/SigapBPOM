# language: id
# Skenario penerimaan UC-08 Merekap dan Mengunduh Laporan Layanan, mengikuti SRS Tabel B.9 dan Tabel 4.8 (REQ-8.1 sampai
# REQ-8.4, BR-8, NFR-14). Langkahnya memanggil LaporanController dengan PenyimpananLaporanTiruan, yang meniru RPC
# rekap_layanan (data contoh sejak Juni 2026) dan pemeriksaan hak ekspor.
Fitur: Merekap dan mengunduh laporan layanan
  Petugas menampilkan rekapitulasi layanan pada periode tertentu dan mengunduh berkas laporannya untuk evaluasi
  internal dan pelaporan. Hanya petugas berhak ekspor yang bisa mengunduh laporan.

  Latar Belakang:
    Diketahui petugas sudah masuk ke dashboard SIGAP

  Skenario: Rekapitulasi layanan ditampilkan (Basic Path)
    Ketika petugas membuka halaman rekap dan laporan
    Maka pilihan "Periode" memuat "01-09-2026 s.d. 30-09-2026" dan "01-01-2025 s.d. 31-01-2025"
    Ketika petugas memilih "01-09-2026 s.d. 30-09-2026" pada pilihan "Periode"
    Dan petugas menekan "Tampilkan"
    Maka TabelRekapitulasi menampilkan rekap per minggu:
      | awal       | akhir      |
      | 2026-09-01 | 2026-09-07 |
      | 2026-09-08 | 2026-09-14 |
      | 2026-09-15 | 2026-09-21 |
      | 2026-09-22 | 2026-09-28 |
      | 2026-09-29 | 2026-09-30 |
    Dan GrafikRekapitulasi menampilkan jumlah panggilan, kasus tereskalasi, dan pengaduan selesai setiap minggu
    Dan kartu total menampilkan jumlah panggilan, kasus tereskalasi, dan pengaduan selesai selama periode

  Skenario: Pilihan format berkas tampil bagi petugas berhak ekspor (Basic Path langkah 7 dan 8)
    Diketahui rekapitulasi layanan periode "01-09-2026 s.d. 30-09-2026" sudah ditampilkan
    Ketika petugas menekan "Unduh Laporan"
    Maka PilihanFormatBerkas ditampilkan
    Dan tidak ada pesan penolakan

  Skenario: Berkas laporan terunduh (Basic Path)
    Diketahui rekapitulasi layanan periode "01-09-2026 s.d. 30-09-2026" sudah ditampilkan
    Ketika petugas menekan "Unduh Laporan"
    Maka PilihanFormatBerkas ditampilkan
    Ketika petugas memilih "PDF" pada pilihan "Format Berkas"
    Dan petugas menekan "Konfirmasi Unduh"
    Maka berkas laporan PDF periode "01-09-2026 s.d. 30-09-2026" tersusun
    Dan sistem menampilkan pesan "Laporan berhasil diunduh."

  Skenario: Periode yang dipilih tidak memuat data (Alternative Path 1)
    Ketika petugas membuka halaman rekap dan laporan
    Dan petugas memilih "01-01-2025 s.d. 31-01-2025" pada pilihan "Periode"
    Dan petugas menekan "Tampilkan"
    Maka sistem menampilkan pesan "Data tidak tersedia pada periode tersebut."
    Dan TabelRekapitulasi dan GrafikRekapitulasi tidak ditampilkan

  Skenario: Petugas tidak memiliki hak akses ekspor (Exception Path 1)
    Diketahui petugas yang masuk tidak memiliki hak akses ekspor data
    Dan rekapitulasi layanan periode "01-09-2026 s.d. 30-09-2026" sudah ditampilkan
    Ketika petugas menekan "Unduh Laporan"
    Maka sistem menampilkan pesan "Anda tidak memiliki hak akses ekspor data."
    Dan PilihanFormatBerkas tidak ditampilkan
