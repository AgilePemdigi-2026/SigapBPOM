# PRD SIGAP: Sistem Informasi dan Gerbang Aduan Publik

> PRD utama kini ada di `docs/prd/` (format prd-generator). Dokumen ini adalah rujukan rinci: kode REQ, NFR, BR, kamus pesan sistem (Lampiran A), dan label UI (Lampiran B). Bila berbeda, SRS v1.0 tetap dokumen resmi tertinggi.

| Item | Keterangan |
|---|---|
| Produk | SIGAP v1.0, AI Voice Agent untuk layanan HaloBPOM |
| Pemilik | Kelompok 2 Kelas I4, Universitas Airlangga: Hariz Fauzil Adhim, Adrian Faishal Hilmy, Thoriq Rafi Al Bani, Kevin Brawijaya |
| Status | Draft 1.0, diturunkan dari SRS v1.0 (8 Oktober 2026) dan Sprint Planning Sprint 1 (Minggu 10) |
| Sumber kebenaran | SRS adalah dokumen kebutuhan resmi. PRD ini merangkum dan mengoperasionalkan SRS untuk tim pengembang. Jika ada perbedaan, SRS menang dan PRD diperbarui. |

## 1. Ringkasan

SIGAP adalah agen suara berbasis AI yang melayani masyarakat lewat tombol "Telepon CS AI" di situs HaloBPOM. Agen menjawab pertanyaan legalitas produk dari data registrasi resmi BPOM, menjawab pertanyaan edukasi obat dan makanan dari basis pengetahuan, mencatat pengaduan produk dengan nomor tiket, dan meneruskan pertanyaan yang butuh penilaian manusia ke petugas.

Petugas HaloBPOM memakai dashboard web untuk memantau layanan, membaca transkrip, menangani pengaduan sampai tiket ditutup, mengelola basis pengetahuan, dan mengunduh laporan. Otomatisasi dibatasi pada pengumpulan data dan penerbitan tiket. Keputusan atas pengaduan tetap di tangan petugas.

## 2. Latar Belakang dan Masalah

HaloBPOM melayani informasi dan pengaduan lewat telepon 1500533, pesan, surel, dan media sosial. Banyak pertanyaan sebenarnya bisa dijawab dari data publik (cekbpom.pom.go.id, portal KataBPOM), tetapi penelepon tetap memilih menghubungi petugas. Akibatnya pertanyaan rutin mengantre bersama pengaduan yang benar-benar butuh penilaian manusia.

Masalah yang diselesaikan:

- Beban petugas untuk pertanyaan yang bisa dijawab otomatis.
- Pengaduan masuk dengan data tidak lengkap sehingga perlu bolak-balik.
- Tidak ada rekam jejak percakapan dan tindak lanjut yang terstruktur.

## 3. Tujuan dan Metrik Keberhasilan

| Tujuan | Metrik | Target | Sumber |
|---|---|---|---|
| Jawaban cepat | Waktu mulai jawaban suara setelah penelepon selesai bicara | ≤ 3 detik pada 95% interaksi | NFR-1 |
| Cek produk cepat | Waktu pencarian data registrasi termasuk respons cekbpom | ≤ 5 detik | NFR-2 |
| Dashboard responsif | Waktu muat halaman pada koneksi 10 Mbps | ≤ 3 detik | NFR-3 |
| Skalabilitas | Panggilan simultan tanpa penurunan waktu respons | ≥ 50 | NFR-4 |
| Ketersediaan | Uptime layanan suara dan dashboard selama jam layanan | ≥ 99% | NFR-16 |
| Rekap cepat | Waktu sajian rekapitulasi satu bulan | ≤ 10 detik | NFR-5 |
| Deflection | Persentase panggilan yang selesai tanpa petugas | Usulan ≥ 80%, belum ditetapkan di SRS | Mockup dashboard menampilkan 93% |

Target angka final menunggu uji beban (Appendix C SRS, butir 6).

## 4. Di Luar Cakupan

- Nasihat medis atau penilaian keamanan konsumsi produk. Pertanyaan ini wajib dieskalasi (NFR-6).
- Keputusan tindak lanjut pengaduan secara otomatis (NFR-9).
- Mengganti kanal HaloBPOM yang sudah ada. SIGAP melengkapi, bukan menggantikan.
- Integrasi telepon PSTN ke nomor 1500533. Akses v1.0 hanya lewat browser (WebRTC).
- Manajemen akun petugas (buat akun, reset password, buka kunci). SRS hanya menyebut "Hubungi administrator". Lihat Bagian 15.
- Bahasa selain Indonesia.

## 5. Pengguna

| Pengguna | Karakteristik | Akses | Fitur |
|---|---|---|---|
| Penelepon | Masyarakat umum, literasi digital beragam, tanpa login, ponsel atau komputer dengan mikrofon | Publik | F-01, F-02 |
| Petugas HaloBPOM | Pegawai BPOM, paham regulasi, pakai dashboard setiap hari kerja | Login email dan password | F-03 sampai F-08 |
| Petugas dengan hak ekspor | Subset petugas yang punya izin ekspor data | Login plus flag hak ekspor | F-08 unduh laporan |

Prioritas pemenuhan kebutuhan: petugas paling penting karena bertanggung jawab atas tindak lanjut. Penelepon paling banyak jumlahnya, jadi antarmuka suara dibuat sesederhana mungkin: dua pilihan menu dan bahasa sehari-hari (NFR-17).

## 6. Alur Pengguna Utama

**Penelepon, informasi produk.** Buka halaman publik, tekan "Telepon CS AI", izinkan mikrofon, dengar menu, tekan 1, sebutkan nama produk atau pertanyaan, lihat transkrip langsung, dengar jawaban. Jika produk tidak ditemukan, sistem menawarkan pengaduan. Jika pertanyaan butuh petugas, sistem minta nomor telepon dan menerbitkan tiket ESK.

**Penelepon, pengaduan.** Tekan 2, sebutkan nama produk, kronologi, nama, dan nomor telepon. Sistem menanyakan ulang data yang kurang sampai lengkap, lalu menerbitkan tiket ADU dan memberi tahu tindak lanjut lewat SMS. Jika panggilan diakhiri sebelum lengkap, percakapan disimpan tanpa tiket.

**Petugas, pemantauan.** Login, lihat ringkasan statistik dan kasus perlu tindak lanjut, buka panggilan berjalan (live), buka antrean tiket eskalasi, klik "Buka Kasus".

**Petugas, penanganan pengaduan.** Buka daftar pengaduan, klik "Telaah", pilih tindak lanjut (Telaah Dokumen, Perlu Pemeriksaan Lapangan, Bukan Kewenangan BPOM), isi catatan, simpan. Jika perlu pemeriksaan, isi jadwal dan unit pelaksana. Susun tanggapan, simpan, tutup tiket. Sistem kirim SMS ke pelapor.

**Petugas, basis pengetahuan dan laporan.** Tambah materi dengan rujukan sumber wajib, nonaktifkan materi usang, telusuri graf pengetahuan. Pilih periode, tampilkan rekap, unduh PDF atau CSV jika punya hak ekspor.

## 7. Kebutuhan Fungsional

Prioritas memakai MoSCoW dari Sprint Planning. Effort memakai T-shirt size dengan bobot S=1, M=2, L=3, XL=4, XXL=5. Kriteria penerimaan lengkap dalam Gherkin ada di SRS Appendix F dan wajib dijalankan sebagai uji penerimaan (NFR-19).

### F-01 Menanyakan Informasi Produk (UC-01)

| Prioritas | Effort | Sprint | Aktor |
|---|---|---|---|
| Must Have | XXL (5) | 1 | Penelepon |

Penelepon menanyakan legalitas produk atau topik edukasi lewat suara. Sistem mencari di data registrasi BPOM atau basis pengetahuan dan menjawab langsung.

Kebutuhan:

- REQ-1.1 Setelah "Telepon CS AI" ditekan, sistem memutar menu "Tekan 1 untuk informasi produk, tekan 2 untuk pengaduan."
- REQ-1.2 Transkrip ucapan penelepon tampil di panel percakapan secara langsung.
- REQ-1.3 Nomor izin edar dan status izin dicari di data registrasi BPOM lewat tool calling, bukan dibangkitkan LLM.
- REQ-1.4 Nama produk yang kurang jelas diminta ulang, paling banyak dua kali.
- REQ-1.5 Jika hasil lebih dari satu, sistem menyebutkan jumlah hasil dan paling banyak tiga kandidat, lalu penelepon memilih.
- REQ-1.6 Jawaban edukasi menyertakan sumber rujukan dari basis pengetahuan.
- REQ-1.7 Pertanyaan yang tidak bisa dijawab otomatis: minta nomor telepon, terbitkan tiket eskalasi, teruskan ke antrean petugas.
- REQ-1.8 Pertanyaan di luar topik obat dan makanan ditolak dengan pesan baku.

Jalur yang harus ditangani: produk ditemukan tunggal, pertanyaan edukasi, eskalasi (misal nasihat medis), produk tidak ditemukan, hasil ganda, di luar topik, nama produk tidak jelas.

Kriteria penerimaan ringkas:

- Diberikan penelepon menyebut "Susu Formula Sehat", maka transkrip menampilkan teks itu dan sistem mengucapkan nomor izin edar serta status "Berlaku" sesuai data cekbpom.
- Diberikan pertanyaan "Apakah obat batuk ini aman untuk ibu hamil?", maka sistem tidak menjawab secara medis, meminta nomor telepon, dan menerbitkan tiket ESK.
- Diberikan produk tidak ada di registrasi, maka sistem tidak menyebut status apa pun dan menawarkan tekan 2 (NFR-7).
- Diberikan nama produk tidak jelas tiga kali, maka permintaan ulang berhenti di dua kali (BR-6).

### F-02 Menyampaikan Pengaduan Produk (UC-02)

| Prioritas | Effort | Sprint | Aktor |
|---|---|---|---|
| Must Have | XL (4) | 2 | Penelepon |

Kebutuhan:

- REQ-2.1 Setelah tekan 2, sistem menanyakan nama produk, kronologi kejadian, nama, dan nomor telepon.
- REQ-2.2 Data yang belum disebutkan ditanyakan kembali sampai lengkap.
- REQ-2.3 Pengaduan dicatat di register, tiket diterbitkan, berkas masuk antrean tindak lanjut petugas.
- REQ-2.4 Nomor tiket disampaikan beserta info tindak lanjut lewat SMS.
- REQ-2.5 Panggilan diakhiri sebelum lengkap: simpan sebagai "pengaduan tidak lengkap" tanpa tiket.

Kriteria penerimaan ringkas:

- Diberikan penelepon menyebut produk, kronologi, dan nama tanpa nomor telepon, maka sistem bertanya "Mohon sebutkan nomor telepon Anda." dan baru menerbitkan tiket setelah lengkap (BR-1).
- Diberikan panggilan diakhiri saat data sebagian, maka tidak ada tiket dan percakapan berstatus pengaduan tidak lengkap.

### F-03 Melakukan Login Dashboard (UC-03)

| Prioritas | Effort | Sprint | Aktor |
|---|---|---|---|
| Must Have | M (2) | 1 | Petugas |

Kebutuhan:

- REQ-3.1 Validasi isian email dan password sebelum cek kredensial.
- REQ-3.2 Kredensial benar: bentuk sesi, arahkan ke halaman ringkasan layanan.
- REQ-3.3 Isian kosong: pesan "Login gagal. Semua field harus diisi!"
- REQ-3.4 Kredensial salah: pesan "Login gagal. Email atau password Anda salah."
- REQ-3.5 Tiga kali gagal berturut-turut: kunci akun sementara.

Keamanan terkait: password disimpan sebagai hash (NFR-10), sesi berakhir setelah 30 menit tanpa aktivitas (NFR-12).

### F-04 Memantau Layanan (UC-04)

| Prioritas | Effort | Sprint | Aktor |
|---|---|---|---|
| Should Have | L (3) | 2 | Petugas |

Kebutuhan:

- REQ-4.1 Halaman ringkasan: kartu statistik (panggilan hari ini, dijawab otomatis AI, tiket eskalasi baru, pengaduan selesai), daftar kasus perlu tindak lanjut, jumlah panggilan berjalan, persentase pertanyaan per kategori 7 hari terakhir.
- REQ-4.2 Halaman panggilan berjalan: daftar panggilan aktif dengan nomor tersamarkan, jenis layanan, topik, waktu mulai, durasi, tahap pemrosesan AI. Diperbarui otomatis (LIVE). Jika kosong, tampilkan "Tidak ada panggilan berjalan saat ini."
- REQ-4.3 Halaman tiket eskalasi: antrean dengan nomor tiket, ringkasan masalah, jenis kasus, waktu masuk, tautan transkrip, status.
- REQ-4.4 Tombol "Buka Kasus" membuka halaman detail pengaduan.

### F-05 Membaca Transkrip Percakapan (UC-05)

| Prioritas | Effort | Sprint | Aktor |
|---|---|---|---|
| Should Have | M (2) | 3 | Petugas |

Kebutuhan:

- REQ-5.1 Daftar percakapan dengan waktu, jenis, ringkasan, status penyelesaian, plus ringkasan periode.
- REQ-5.2 Detail transkrip dengan stempel waktu, ringkasan buatan AI, status penyelesaian. Data pribadi pelapor disamarkan, contoh "B*** S******" dan "0812****7890" (NFR-13).
- REQ-5.3 Catatan pemeriksaan tersimpan pada percakapan terkait.
- REQ-5.4 Catatan kosong ditolak dengan pesan "Catatan pemeriksaan wajib diisi."

### F-06 Menangani Pengaduan (UC-06)

| Prioritas | Effort | Sprint | Aktor |
|---|---|---|---|
| Must Have | L (3) | 3 | Petugas |

Kebutuhan:

- REQ-6.1 Pilihan "Tindak Lanjut": "Telaah Dokumen", "Perlu Pemeriksaan Lapangan", "Bukan Kewenangan BPOM".
- REQ-6.2 Hasil telaah tersimpan dengan status sesuai pilihan: Sedang Ditelaah, Menunggu Pemeriksaan (setelah jadwal), atau Diteruskan ke Instansi Lain.
- REQ-6.3 Jadwal pemeriksaan dengan tanggal dan unit pelaksana tersimpan dengan status "Menunggu Pemeriksaan".
- REQ-6.4 Tanggapan resmi tersimpan dengan status "Tanggapan Disusun".
- REQ-6.5 Tiket tanpa tanggapan tersimpan tidak bisa ditutup (BR-2).
- REQ-6.6 Tutup tiket: status "Selesai" dan SMS tindak lanjut terkirim ke pelapor.

Mesin status pengaduan:

```
Belum Ditelaah
  -> Sedang Ditelaah            (Telaah Dokumen)
  -> Menunggu Pemeriksaan       (Perlu Pemeriksaan Lapangan + jadwal tersimpan)
  -> Diteruskan ke Instansi Lain (Bukan Kewenangan BPOM, berhenti di sini, BR-3)
Sedang Ditelaah | Menunggu Pemeriksaan
  -> Tanggapan Disusun          (tanggapan tersimpan)
Tanggapan Disusun
  -> Selesai                    (Tutup Tiket, kirim SMS)
```

Halaman detail memakai stepper: Telaah, Jadwal Pemeriksaan (opsional), Susun Tanggapan, Tutup Tiket.

### F-07 Mengelola Basis Pengetahuan (UC-07)

| Prioritas | Effort | Sprint | Aktor |
|---|---|---|---|
| Must Have | L (3) | 1 | Petugas |

Kebutuhan:

- REQ-7.1 Materi baru tersimpan berstatus aktif jika "Judul Materi" dan "Rujukan Sumber" terisi. Setelah tersimpan materi langsung terindeks untuk RAG dan sistem menampilkan "Materi siap digunakan sistem."
- REQ-7.2 Materi tanpa rujukan sumber ditolak dengan pesan "Rujukan sumber wajib diisi." (BR-4).
- REQ-7.3 Materi usang ditandai tidak aktif, tidak dihapus permanen, dan tidak lagi dipakai sebagai sumber jawaban (BR-5).
- REQ-7.4 Graf pengetahuan menampilkan keterkaitan antarmateri. Memilih simpul menampilkan rujukan sumber dan bagian dokumen yang terindeks.

Fitur pendukung di mockup: pencarian materi, informasi jumlah materi dan tanggal pembaruan terakhir di sidebar.

### F-08 Merekap dan Mengunduh Laporan Layanan (UC-08)

| Prioritas | Effort | Sprint | Aktor |
|---|---|---|---|
| Should Have | M (2) | 3 | Petugas (unduh: hak ekspor) |

Kebutuhan:

- REQ-8.1 Hitung jumlah panggilan, kasus tereskalasi, dan pengaduan selesai pada periode terpilih.
- REQ-8.2 Tampilkan rekap dalam grafik, tiga kartu total, dan tabel per minggu. Periode tanpa data: pesan "Data tidak tersedia pada periode tersebut."
- REQ-8.3 Periksa hak akses ekspor sebelum menampilkan pilihan format. Tanpa hak: "Anda tidak memiliki hak akses ekspor data." (BR-8, NFR-14).
- REQ-8.4 Susun berkas sesuai periode dan format (PDF atau CSV), lalu tampilkan "Laporan berhasil diunduh."

## 8. Halaman dan Navigasi

| No | Halaman | Rute | UC |
|---|---|---|---|
| 1 | Halaman Publik HaloBPOM | `/homepage` | UC-01, UC-02 |
| 2 | Panel Percakapan Suara | komponen di `/homepage` | UC-01, UC-02 |
| 3 | Login Petugas | `/login` | UC-03 |
| 4 | Ringkasan Layanan | `/ringkasan` | UC-04 |
| 5 | Panggilan Berjalan | `/panggilan-berjalan` | UC-04 |
| 6 | Tiket Eskalasi | `/tiket-eskalasi` | UC-04 |
| 7 | Riwayat Percakapan | `/riwayat-percakapan` | UC-05 |
| 8 | Detail Transkrip | `/riwayat-percakapan/detail` | UC-05 |
| 9 | Daftar Pengaduan | `/pengaduan` | UC-06 |
| 10 | Detail Pengaduan | `/pengaduan/detail` | UC-06 |
| 11 | Basis Pengetahuan | `/basis-pengetahuan` | UC-07 |
| 12 | Rekap dan Laporan | `/rekap-laporan` | UC-08 |

Dashboard memakai sidebar kiri dengan urutan menu: Ringkasan Layanan, Panggilan Berjalan, Tiket Eskalasi, Riwayat Percakapan, Daftar Pengaduan, Basis Pengetahuan, Rekap & Laporan. Header memuat pencarian global (tiket, nomor telepon, produk), notifikasi, dan tanggal-waktu WIB. Sidebar bawah menampilkan status AI Voice Agent dan profil petugas dengan tombol keluar. Resolusi minimum dashboard 1366 × 768. Panel suara harus responsif di ponsel.

Rute detail memakai identifier di query atau path; bentuk finalnya ditetapkan saat implementasi, selama rute dasar di atas dipertahankan.

## 9. Model Data

Sebelas entitas sesuai PDM SRS Appendix B:

| Entitas | Atribut utama | Relasi |
|---|---|---|
| Penelepon | no_Telp, Nama_pelapor, NIK_pelapor | melakukan Percakapan, menerima Notifikasi |
| Percakapan | waktu_mulai, waktu_selesai, jenis_interaksi, status_penyelesaian, isi_percakapan, ringkasan | memicu Tiket, menghasilkan Pengaduan, memiliki Catatan_Pemeriksaan |
| Pengaduan | nama_produk_diadukan, kronologi, Tgl_pengaduan, kelengkapan_data, status_pengaduan | teridentifikasi Tiket, ditelaah Hasil_Telaah |
| Tiket | No_Tiket, jenis_Tiket, Tgl_terbit, status_tiket | ditanggapi Tanggapan, memicu Notifikasi |
| Hasil_Telaah | Tgl_telaah, keputusan_tindak_lanjut, catatan_telaah | menjadwalkan Jadwal_Pemeriksaan, dibuat Petugas |
| Jadwal_Pemeriksaan | Tgl_Pemeriksaan, unit_pelaksana, status_pemeriksaan | ditetapkan Petugas |
| Tanggapan | isi_tanggapan, Tgl_tanggapan, status_tanggapan | disusun Petugas |
| Notifikasi | isi_notifikasi, Tgl_pengiriman, status_pengiriman | ke Penelepon |
| Catatan_Pemeriksaan | isi_catatan, waktu_pencatatan | ditulis Petugas |
| Materi_Pengetahuan | judul_materi, isi_materi, rujukan_sumber, Tgl_pemutakhiran, status_materi | diperbarui Petugas |
| Petugas | Nama_Petugas, email, kata_sandi (hash), status | ditambah flag hak ekspor |

Catatan implementasi:

- Data legalitas produk tidak disimpan. Selalu diambil langsung dari cekbpom (SRS 3.3).
- PDM asli memakai `char(5)` untuk ID dan `varchar(8)` untuk kata sandi. Keduanya tidak memadai untuk hash password dan volume produksi. Gunakan UUID atau bigint auto-increment untuk ID dan kolom panjang untuk hash. Perubahan ini dicatat sebagai keputusan desain.
- Petugas butuh atribut hak ekspor (boolean atau role) yang belum ada di PDM.
- Materi edukasi juga diindeks di Indeks Basis Pengetahuan (vector store) untuk RAG, terpisah dari tabel relasional.

Enumerasi:

- `status_pengaduan`: Belum Ditelaah, Sedang Ditelaah, Menunggu Pemeriksaan, Tanggapan Disusun, Selesai, Diteruskan ke Instansi Lain.
- `status_penyelesaian` percakapan: selesai oleh AI, dieskalasi, tiket terbit, pengaduan tidak lengkap.
- `jenis_Tiket`: pengaduan (prefiks ADU), eskalasi (prefiks ESK). Format final belum ditetapkan.
- `keputusan_tindak_lanjut`: Telaah Dokumen, Perlu Pemeriksaan Lapangan, Bukan Kewenangan BPOM.
- `status_materi`: aktif, tidak aktif.
- `jenis_interaksi`: informasi produk, pengaduan.

## 10. Integrasi Eksternal

| Layanan | Fungsi | Protokol | Status |
|---|---|---|---|
| cekbpom.pom.go.id | Sumber nomor izin edar dan status izin, dipanggil lewat tool calling | REST/HTTPS | Akses resmi belum dipastikan |
| Penyedia LLM | Pengenalan maksud dan penyusunan jawaban RAG | REST/HTTPS | Hermes Agent dengan model GPT (langganan), ADR 0001 |
| Speech-to-Text | Ucapan Indonesia ke teks | Streaming | ElevenLabs API premium, ADR 0001 |
| Text-to-Speech | Teks jawaban ke suara Indonesia | Streaming | ElevenLabs API premium, ADR 0001 |
| SMS Gateway | Kirim nomor tiket, jawaban petugas, notifikasi tindak lanjut | REST/HTTPS | Menunggu pengadaan |
| Portal KataBPOM | Sumber materi edukasi untuk basis pengetahuan | Impor manual oleh petugas | Tersedia publik |

Arsitektur: layered. Browser (halaman publik plus panel suara, dashboard) → Voice Gateway (WebRTC/WSS, codec Opus) → AI Voice Agent (STT, LLM+RAG, TTS) → Backend SIGAP (REST API + controller) → Basis Data SIGAP dan Indeks Basis Pengetahuan. Dashboard berbicara ke backend yang sama lewat HTTPS/JSON.

Stack (ADR 0001, `docs/decisions/0001-stack.md`): frontend Astro, backend Supabase (Postgres, Auth, Realtime, Storage, Edge Functions, pgvector), AI Agent Hermes Agent dengan model GPT langganan, STT dan TTS ElevenLabs API premium.

Format respons API standar:

```json
{ "status": "success", "message": "Pengaduan Anda telah dicatat.", "data": { "no_tiket": "ADU-0456" } }
```

Nilai `status` adalah `success` atau `error`. Kode HTTP mengikuti semantik: 200, 400, 401, 403, 404, 500.

## 11. Kebutuhan Non-Fungsional

Performa: NFR-1 sampai NFR-5, lihat Bagian 3.

Keselamatan:

- NFR-6 Tidak ada nasihat medis atau penilaian keamanan konsumsi. Wajib eskalasi.
- NFR-7 Produk yang tidak ditemukan tidak boleh diberi status legalitas apa pun.
- NFR-8 Setiap jawaban edukasi menyertakan sumber rujukan.
- NFR-9 Keputusan tindak lanjut tidak pernah otomatis.

Keamanan:

- NFR-10 Autentikasi email dan password, password di-hash.
- NFR-11 Kunci akun setelah tiga kali gagal berturut-turut.
- NFR-12 Sesi berakhir setelah 30 menit tanpa aktivitas.
- NFR-13 Data pribadi pelapor disamarkan di transkrip untuk petugas.
- NFR-14 Unduh laporan hanya untuk petugas berhak ekspor.
- NFR-15 Seluruh komunikasi TLS 1.2 atau lebih baru.

Kualitas:

- NFR-16 Ketersediaan 99% selama jam layanan.
- NFR-17 Menu suara dua pilihan, bahasa Indonesia sehari-hari.
- NFR-18 Kode dipisah menurut pola Boundary, Control, Entity.
- NFR-19 Setiap UC punya skenario Gherkin yang bisa dijalankan.
- NFR-20 Setiap percakapan tersimpan dengan transkrip dan ringkasan.

Lainnya:

- OR-1 Bahasa Indonesia baku untuk UI dan pesan sistem.
- OR-2 Kepatuhan UU 27/2022 tentang Pelindungan Data Pribadi.
- OR-3 Transkrip tampil langsung sebagai aksesibilitas bagi penelepon dengan gangguan pendengaran.
- OR-4 Retensi data mengikuti kebijakan arsip BPOM.

## 12. Aturan Bisnis

| Kode | Aturan |
|---|---|
| BR-1 | Tiket pengaduan hanya terbit setelah nama produk, kronologi, nama, dan nomor telepon lengkap. |
| BR-2 | Tiket tidak bisa ditutup sebelum tanggapan resmi tersimpan. |
| BR-3 | Pengaduan di luar kewenangan BPOM berstatus "Diteruskan ke Instansi Lain" dan tidak lanjut ke tahap berikutnya. |
| BR-4 | Setiap materi basis pengetahuan wajib punya rujukan sumber. |
| BR-5 | Materi usang dinonaktifkan, tidak dihapus permanen. |
| BR-6 | Permintaan ulang nama produk paling banyak dua kali. |
| BR-7 | Kandidat produk yang disebutkan paling banyak tiga. |
| BR-8 | Hanya petugas berhak ekspor yang bisa mengunduh laporan. |

## 13. Rencana Rilis

Total effort 24 poin, tiga sprint, mulai Minggu 10. Burndown ideal turun 8 poin per sprint.

| Sprint | Fitur | Effort | Fokus teknis |
|---|---|---|---|
| 1 | F-01 Informasi Produk, F-03 Login, F-07 Basis Pengetahuan | 10 | Pipeline suara end-to-end, tool calling cekbpom, RAG dan indeks, autentikasi, kerangka dashboard |
| 2 | F-02 Pengaduan, F-04 Memantau Layanan | 7 | Dialog pengumpulan data bertahap, register pengaduan dan tiket, dashboard live |
| 3 | F-05 Transkrip, F-06 Menangani Pengaduan, F-08 Laporan | 7 | Masking PII, mesin status pengaduan, SMS Gateway, ekspor PDF/CSV |

Sprint 1 membawa risiko terbesar karena F-01 adalah fitur XXL yang bergantung pada tiga layanan eksternal yang belum dipilih. Lihat Bagian 14.

## 14. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Akses resmi ke API cekbpom tidak tersedia | F-01 tidak bisa menjawab legalitas | Bangun adapter dengan interface tetap. Sediakan implementasi mock berbasis data contoh untuk pengembangan dan demo. Scraping dicatat sebagai opsi terakhir dengan risiko legal. |
| Akurasi STT/TTS bahasa Indonesia rendah | Pengalaman penelepon buruk, nama produk sering salah | Uji beberapa penyedia pada Sprint 1 dengan sampel nama produk BPOM. Manfaatkan REQ-1.4 dan REQ-1.5 sebagai pengaman. |
| LLM mengarang nomor izin edar | Melanggar batasan desain dan NFR-7 | Legalitas hanya lewat tool calling. Prompt sistem melarang jawaban legalitas tanpa hasil tool. Uji regresi otomatis. |
| LLM memberi nasihat medis | Melanggar NFR-6 | Klasifikasi maksud sebelum menjawab. Daftar kata kunci medis sebagai pemicu eskalasi. Uji dengan skenario Gherkin. |
| Kebocoran data pribadi pelapor | Pelanggaran UU PDP | Masking di server, bukan di klien. Log tidak menyimpan PII mentah. Enkripsi transport. |
| SMS Gateway belum ada | F-02 dan F-06 tidak bisa kirim notifikasi | Antarmuka notifikasi dengan implementasi "log only" sampai pengadaan selesai. |
| Kuota atau syarat layanan model GPT langganan membatasi pemakaian publik | Agen berhenti menjawab saat beban tinggi | Pastikan syarat layanan di Sprint 1. Adapter LLM memungkinkan pindah ke OpenAI API tanpa mengubah use case. |

## 15. Keputusan yang Belum Ditetapkan

| No | Hal | Status | Pemilik usulan |
|---|---|---|---|
| 1 | Penyedia LLM, STT, TTS | Ditetapkan di ADR 0001: GPT via Hermes Agent, ElevenLabs. Uji akurasi bahasa Indonesia tetap di Sprint 1 | Tim |
| 2 | Penyedia SMS Gateway | Menunggu pengadaan | Tim / BPOM |
| 3 | Format nomor tiket | "ADU-0456" dan "ESK-0123" hanya ilustrasi | Tim |
| 4 | Masa retensi transkrip dan pengaduan | Mengikuti kebijakan arsip BPOM | BPOM |
| 5 | Format unduhan di riwayat percakapan | CSV dan PDF masih dievaluasi | Tim |
| 6 | Nilai final target kinerja | Setelah uji beban | Tim |
| 7 | Framework backend dan bahasa pemrograman | Ditetapkan di ADR 0001: Astro, Supabase, TypeScript | Tim |
| 8 | Manajemen akun dan buka kunci akun oleh administrator | Tidak ada di SRS, dibutuhkan oleh REQ-3.5 | Tim |
| 9 | Kerangka uji penerimaan Gherkin untuk stack TypeScript | SRS menyebut Behat (PHP), tidak cocok dengan ADR 0001 | Tim |

## Lampiran A. Kamus Pesan Sistem

Teks berikut wajib dipakai persis, karena menjadi dasar skenario penerimaan.

| UC | Pemicu | Pesan |
|---|---|---|
| 01, 02 | Panggilan tersambung | Tekan 1 untuk informasi produk, tekan 2 untuk pengaduan. |
| 01 | Tekan 1 | Silakan sebutkan nama produk atau pertanyaan Anda. |
| 01 | Produk ditemukan | [Nama produk] terdaftar dengan nomor izin edar [NIE], status izin [Status]. |
| 01 | Butuh petugas | Pertanyaan Anda akan diteruskan kepada petugas. Mohon sebutkan nomor telepon Anda. |
| 01 | Tiket eskalasi terbit | Nomor tiket Anda [nomor tiket]. Jawaban petugas akan dikirim melalui SMS. |
| 01 | Produk tidak ditemukan | Produk tidak ditemukan pada data registrasi BPOM. Tekan 2 untuk menyampaikan pengaduan. |
| 01 | Di luar topik | Pertanyaan tersebut berada di luar cakupan layanan HaloBPOM. |
| 01 | Nama tidak jelas | Maaf, nama produk kurang jelas. Mohon sebutkan kembali. |
| 01, 02 | Penelepon selesai bicara, AI menyusun jawaban | Baik, sebentar saya cek ya. |
| 01, 02 | Pertanyaan selesai dijawab | Apakah ada yang bisa saya bantu lagi? Jika tidak, percakapan ini akan saya tutup. |
| 01, 02 | Penelepon tidak butuh bantuan lagi | Terima kasih sudah menghubungi HaloBPOM. Percakapan ini saya tutup ya. |
| 01, 02 | Batas pemakaian AI harian tercapai | Layanan AI sudah mencapai batas pemakaian hari ini. Silakan coba lagi besok. |
| 01, 02 | Batas percakapan satu panggilan tercapai | Batas percakapan untuk panggilan ini sudah tercapai. Silakan akhiri dan mulai panggilan baru. |
| 01 | Batas tiket eskalasi tercapai | Batas penerbitan tiket hari ini sudah tercapai. Silakan coba lagi besok. |
| 02 | Tekan 2 | Silakan sebutkan nama produk, kronologi kejadian, nama, dan nomor telepon Anda. |
| 02 | Data kurang (contoh) | Mohon sebutkan nomor telepon Anda. |
| 02 | Tiket pengaduan terbit | Pengaduan Anda telah dicatat dengan nomor tiket [nomor tiket]. Tindak lanjut akan dikirim melalui SMS. |
| 02 | Panggilan putus, data kurang | Panggilan berakhir. Pengaduan belum lengkap sehingga nomor tiket tidak diterbitkan. |
| 03 | Login sukses | Login berhasil! |
| 03 | Isian kosong | Login gagal. Semua field harus diisi! |
| 03 | Kredensial salah | Login gagal. Email atau password Anda salah. |
| 03 | Gagal tiga kali | Akses dikunci sementara. Hubungi administrator. |
| 04 | Tidak ada panggilan aktif | Tidak ada panggilan berjalan saat ini. |
| 05 | Catatan tersimpan | Catatan pemeriksaan tersimpan. |
| 05 | Catatan kosong | Catatan pemeriksaan wajib diisi. |
| 06 | Telaah tersimpan | Hasil telaah tersimpan. |
| 06 | Bukan kewenangan | Pengaduan diteruskan ke instansi lain. |
| 06 | Jadwal tersimpan | Jadwal pemeriksaan tersimpan. |
| 06 | Tanggapan tersimpan | Tanggapan tersimpan. |
| 06 | Tutup tiket | Tiket ditutup. |
| 06 | Tutup tanpa tanggapan | Tiket tidak dapat ditutup. Susun tanggapan terlebih dahulu. |
| 07 | Materi tersimpan | Materi siap digunakan sistem. |
| 07 | Materi dinonaktifkan | Materi ditandai tidak aktif. |
| 07 | Rujukan kosong | Rujukan sumber wajib diisi. |
| 07 | Materi gagal dimuat | Materi gagal dimuat. Muat ulang halaman untuk mencoba lagi. |
| 08 | Periode kosong | Data tidak tersedia pada periode tersebut. |
| 08 | Unduh sukses | Laporan berhasil diunduh. |
| 08 | Tanpa hak ekspor | Anda tidak memiliki hak akses ekspor data. |

**Pengecualian pesan API internal.** Pesan dari Edge Function dan endpoint yang hanya dibaca sistem lain (Voice Gateway atau Hermes Agent), bukan ditampilkan atau diucapkan kepada penelepon maupun petugas, tidak wajib tercantum di kamus ini. Contohnya "Nama produk wajib diisi.", "Percakapan tidak valid.", "Percakapan tidak ditemukan.", "Tiket untuk percakapan ini sudah diterbitkan.", dan "Akses ditolak.". Pesan seperti ini tetap ditulis dalam bahasa Indonesia, tidak memuat detail teknis, dan tidak boleh diteruskan apa adanya ke penelepon. Bila suatu saat pesan tersebut ditampilkan atau diucapkan kepada pengguna, pesan itu harus ditambahkan ke kamus lebih dulu.

## Lampiran B. Label Tombol dan Field

Tombol: "Telepon CS AI", "Akhiri Panggilan", "Login", "Buka Kasus", "Lihat Transkrip", "Simpan Catatan", "Telaah", "Simpan Telaah", "Simpan Jadwal", "Simpan Tanggapan", "Tutup Tiket", "Tambah Materi", "Hapus", "Graf Pengetahuan", "Simpan", "Tampilkan", "Unduh Laporan", "Konfirmasi Unduh".

Field: "Email", "Password", "Catatan Pemeriksaan", "Tindak Lanjut", "Catatan Tindak Lanjut", "Tanggal Pemeriksaan", "Unit Pelaksana", "Tanggapan", "Judul Materi", "Rujukan Sumber", "Periode", "Format Berkas".

Teks kartu di transkrip panel suara (UC-01): "Diteruskan ke petugas BPOM", "Jawaban untuk pertanyaan ini akan diberikan oleh petugas, bukan oleh AI.", "Nomor tiket", "Nomor izin edar", "Status", "Pendaftar", "Sumber".

Elemen bernama untuk uji penerimaan: PanelPercakapanSuara, TranskripPercakapan, RingkasanPercakapan, StepperPenanganan, GrafPengetahuan, GrafikRekapitulasi, TabelRekapitulasi.

## Lampiran C. Glosarium Singkat

- **Tiket eskalasi (ESK)**: tiket untuk pertanyaan yang diteruskan ke petugas.
- **Tiket pengaduan (ADU)**: tiket untuk pengaduan produk yang tercatat.
- **Tool calling**: LLM memanggil fungsi backend untuk mengambil data, misalnya pencarian registrasi.
- **RAG**: Retrieval-Augmented Generation, jawaban disusun dari materi basis pengetahuan yang relevan.
- **BCE**: Boundary, Control, Entity, pola pemisahan kelas dari Robustness Analysis.
- **Register layanan**: penyimpanan percakapan, transkrip, dan ringkasan di Basis Data SIGAP.
