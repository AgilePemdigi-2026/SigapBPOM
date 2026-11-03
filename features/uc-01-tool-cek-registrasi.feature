# language: id
# Skenario penerimaan T-F1.2-03: tool cek_registrasi_bpom untuk Hermes (REQ-1.3, REQ-1.4, REQ-1.5, BR-6, BR-7, NFR-7).
# cekbpom diganti server tiruan. Kalimat agen mengikuti kamus pesan PRD-rinci Lampiran A.
Fitur: Tool cek_registrasi_bpom membacakan hasil sesuai aturan legalitas
  Agen tidak pernah mengarang status atau nomor izin edar. Hasil tunggal, hasil kosong, dan nama tidak jelas dijawab
  dengan kalimat baku tanpa AI. Hasil ganda dibacakan Hermes dari hasil tool, lalu penelepon memilih nomornya.

  Latar Belakang:
    Diketahui data registrasi cekbpom berisi:
      | nama                      | merek       | nomor                   | status        | pendaftar                  |
      | Susu Formula Sehat        | Sehat       | BPOM RI MD 865009001234 | Berlaku       | PT Nutrisi Sehat Indonesia |
      | Paracetamol 500 mg Tablet | Paracetamol | DBL1234567810A1         | Berlaku       | PT Farma Nusantara         |
      | Paracetamol Sirup Anak    | Paracetamol | DBL1234567837A1         | Berlaku       | PT Farma Nusantara         |
      | Paracetamol Kaplet Forte  | Paracetamol | DBL1234567904A1         | Tidak Berlaku | PT Medika Prima            |
      | Paracetamol Drop Bayi     | Paracetamol | DBL1234567911A1         | Berlaku       | PT Medika Prima            |

  Skenario: Hasil tunggal dibacakan dengan nomor izin edar dan status
    Diketahui penelepon sudah memilih menu 1
    Ketika penelepon menyebut "Susu Formula Sehat" kepada agen
    Maka agen menjawab tanpa AI "Susu Formula Sehat terdaftar dengan nomor izin edar BPOM RI MD 865009001234, status izin Berlaku." lalu menawarkan bantuan lagi
    Dan kartu produk menampilkan nomor izin edar "BPOM RI MD 865009001234" dengan status "Berlaku"

  Skenario: Hasil ganda menyebut jumlah dan paling banyak tiga kandidat, lalu penelepon memilih nomornya
    Ketika penelepon menyebut "Apakah paracetamol sudah terdaftar di BPOM?" kepada agen
    Maka kartu produk berisi 3 kandidat
    Dan pesan untuk AI memuat "Ada 4 produk yang cocok"
    Dan pesan untuk AI tidak memuat "Paracetamol Drop Bayi"
    Ketika penelepon menyebut "nomor dua" kepada agen
    Maka agen menjawab tanpa AI "Paracetamol Sirup Anak terdaftar dengan nomor izin edar DBL1234567837A1, status izin Berlaku." lalu menawarkan bantuan lagi
    Dan kartu produk menampilkan nomor izin edar "DBL1234567837A1" dengan status "Berlaku"

  Skenario: Hasil kosong memakai pesan baku dan menawarkan pengaduan (NFR-7)
    Ketika penelepon menyebut "Apakah krim glowing ajaib terdaftar di BPOM?" kepada agen
    Maka agen menjawab tanpa AI "Produk tidak ditemukan pada data registrasi BPOM. Tekan 2 untuk menyampaikan pengaduan."
    Dan kartu produk menyatakan tidak ditemukan

  Skenario: Nama produk tidak jelas diminta ulang paling banyak dua kali (BR-6)
    Diketahui penelepon sudah memilih menu 1
    Ketika penelepon menyebut "Apakah sudah terdaftar di BPOM?" kepada agen
    Maka agen menjawab tanpa AI "Maaf, nama produk kurang jelas. Mohon sebutkan kembali."
    Ketika penelepon menyebut "eh itu" kepada agen
    Maka agen menjawab tanpa AI "Maaf, nama produk kurang jelas. Mohon sebutkan kembali."
    Ketika penelepon menyebut "itu tuh" kepada agen
    Maka agen tidak meminta ulang nama produk
    Dan cekbpom tidak dicari sama sekali
