# language: id
# Skenario penerimaan UC-01 untuk cek registrasi produk (PRD-rinci F-01, REQ-1.3, REQ-1.5, BR-7, NFR-7).
# Skenario bertag @live memanggil cekbpom.pom.go.id asli dan hanya jalan lewat `npm run test:bdd:live`.
Fitur: Cek registrasi produk dari cekbpom
  Penelepon menanyakan status registrasi suatu produk dan CS AI menjawab dari data cekbpom.pom.go.id,
  tanpa pernah mengarang status atau nomor izin edar.

  Latar Belakang:
    Diketahui data registrasi cekbpom berisi:
      | nama                       | merek       | nomor           | status   | pendaftar        |
      | Susu Formula Sehat         | Sehat       | MD 865209001234 | Berlaku  | PT Sehat Sentosa |
      | Mi Instan Goreng           | Indomie     | MD 234510001111 | Berlaku  | PT Indofood      |
      | Mi Instan Goreng Rendang   | Indomie     | MD 234510002222 | Berlaku  | PT Indofood      |
      | Mi Instan Goreng Aceh      | Indomie     | MD 234510003333 | Berlaku  | PT Indofood      |
      | Mi Instan Goreng Cabe Ijo  | Indomie     | MD 234510004444 | Berlaku  | PT Indofood      |
      | Krim Malam Glowing         | Glowing     | NA 18201200555  | Dibatalkan | CV Glowing     |

  Skenario: Produk ditemukan tunggal setelah memilih menu 1
    Diketahui penelepon sudah memilih menu 1
    Ketika penelepon berkata "Susu Formula Sehat"
    Maka cekbpom dicari dengan nama "susu formula sehat"
    Dan kartu produk menampilkan nomor izin edar "MD 865209001234" dengan status "Berlaku"
    Dan pesan untuk AI memuat "nomor izin edar MD 865209001234, status Berlaku"

  Skenario: Produk dicari lewat nomor izin edar
    Ketika penelepon berkata "Tolong cek nomor izin edar NA 18201200555"
    Maka cekbpom dicari dengan nomor "NA 18201200555"
    Dan kartu produk menampilkan nomor izin edar "NA 18201200555" dengan status "Dibatalkan"

  Skenario: Hasil ganda menyebut jumlah dan paling banyak tiga kandidat
    Ketika penelepon berkata "Apakah Indomie goreng sudah terdaftar di BPOM?"
    Maka kartu produk berisi 3 kandidat
    Dan pesan untuk AI memuat "Ada 4 produk yang cocok"
    Dan pesan untuk AI meminta nama yang lebih lengkap atau nomor izin edar

  Skenario: Produk tidak ditemukan tidak menyebut status apa pun (NFR-7)
    Ketika penelepon berkata "Apakah krim pemutih abcxyz sudah terdaftar?"
    Maka kartu produk menyatakan tidak ditemukan
    Dan pesan untuk AI tidak memuat status registrasi apa pun
    Dan pesan untuk AI menawarkan tekan 2 untuk pengaduan

  Skenario: cekbpom gangguan tidak membuat AI mengarang status
    Diketahui cekbpom sedang gangguan
    Ketika penelepon berkata "Apakah Susu Formula Sehat terdaftar?"
    Maka tidak ada kartu produk
    Dan pesan untuk AI melarang menyebut status atau nomor izin edar

  Skenario: Pertanyaan edukasi tidak dicari di cekbpom
    Ketika penelepon berkata "Bagaimana cara cek nomor registrasi kosmetik?"
    Maka cekbpom tidak dipanggil

  @live
  Skenario: Scraping cekbpom asli masih mengembalikan data registrasi
    Diketahui cekbpom yang dipakai adalah situs asli
    Ketika penelepon berkata "Tolong cek nomor izin edar MD 304110267157"
    Maka kartu produk menampilkan nomor izin edar "MD 304110267157" dengan status "Berlaku"
