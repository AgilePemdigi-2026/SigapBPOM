# ADR 0006: Tindak Lanjut lewat WhatsApp Manual, Bukan SMS Gateway

Status: Diusulkan, 24 November 2026. Menunggu persetujuan PO karena mengubah REQ-2.4 dan REQ-6.6 SRS.

## Konteks

SRS mengirim nomor tiket (REQ-2.4, REQ-1.7) dan tindak lanjut pengaduan (REQ-6.6) lewat SMS Gateway. Jalurnya sudah dibangun: antrean `notifikasi`, pg_cron, Edge Function `kirim-notifikasi`, dan adapter Zenziva. Namun jalur itu tidak pernah aktif karena belum ada penyedia SMS:

- Semua penyedia SMS resmi yang dicek (Zenziva, NusaSMS, SMSViro) meminta deposit awal sekitar Rp460–500 ribu, dan nama pengirim (masking) harus disetujui operator.
- HP Android sebagai gateway (sms-gate.app) memberi aplikasi pihak ketiga izin membaca semua SMS di HP itu, dan jalurnya P2P, bukan A2P resmi.
- API WhatsApp resmi Meta tidak gratis untuk pesan yang dimulai bisnis. Gateway WhatsApp tidak resmi melanggar ketentuan WhatsApp dan berisiko membuat nomor diblokir.

Ada juga celah yang tidak terkait penyedia. Penelepon ESK diberi tahu "Jawaban petugas akan dikirim melalui SMS", padahal halaman Tiket Eskalasi hanya bisa dibaca. Tidak ada tempat untuk menulis jawaban, dan tidak ada SMS jawaban.

## Keputusan (usulan)

- SMS Gateway dihapus: jadwal pg_cron, trigger SMS nomor tiket, RPC antrean, Edge Function `kirim-notifikasi`, dan adapter SMS. Kodenya tetap ada di riwayat git bila BPOM kelak membeli SMS Gateway.
- Nomor tiket hanya dibacakan per digit di telepon, seperti sekarang.
- Petugas menghubungi pelapor dari halaman detail tiket. Nomor lengkap ditampilkan menonjol, dengan tombol Chat WhatsApp (tautan `wa.me` berisi pesan siap kirim), Telepon (`tel:`), dan Salin. Tidak ada API WhatsApp dan tidak ada biaya.
  - Pengaduan (ADU): setelah tanggapan resmi tersimpan, pesan WhatsApp memuat nomor tiket dan tanggapan itu utuh. Sebelumnya pesan hanya berisi pembuka untuk klarifikasi. Pesan dibuka dengan nama petugas yang masuk.
  - Eskalasi (ESK): pesan berisi pembuka dengan nomor tiket, lalu petugas mengetik jawabannya.
- Petugas menekan "Tandai sudah dihubungi". Tabel `notifikasi` dipakai ulang sebagai catatan kontak: tertunda berarti belum dihubungi, terkirim berarti sudah, dan `dihubungi_oleh` mencatat petugasnya. Tiket ESK menjadi Selesai saat ditandai.
- Urutan pengaduan dibalik dari SRS (migrasi 20261125120000): Tanggapan Disusun, lalu tanggapan dikirim ke pelapor, lalu Tandai sudah dihubungi, baru Tutup Tiket. Dengan SMS, tutup tiket dan pengiriman terjadi dalam satu langkah; dengan WhatsApp manual keduanya terpisah, jadi tiket yang ditutup lebih dulu bisa berstatus Selesai padahal pelapor belum tahu hasilnya. `tutup_tiket` menolak tiket yang pelapornya belum dihubungi dengan pesan "Tiket tidak dapat ditutup. Hubungi pelapor terlebih dahulu." Pengaduan bertanggapan yang belum dihubungi diberi tanda "Belum dihubungi" di Daftar Pengaduan.
- Kalimat agen di telepon menjadi "Petugas akan menghubungi Anda melalui WhatsApp atau telepon …" (Lampiran A UC-01 nomor 01 dan UC-02 nomor 02).
- Untuk sementara petugas memakai WhatsApp pribadi anggota tim. Produksi memakai nomor resmi HaloBPOM, supaya pesan tidak dikira penipuan.

## Pengecualian PROJECT_RULES 5.5 (masking)

PROJECT_RULES 5.5 melarang dashboard menerima nilai mentah data pribadi. ADR ini membuat satu pengecualian: RPC `ambil_kontak_pelapor` mengembalikan nomor telepon lengkap, hanya kepada petugas (`is_petugas()`), hanya untuk satu tiket, dan hanya dipakai halaman detail tiket. NFR-13 tetap berlaku. Transkrip, Riwayat Percakapan, Panggilan Berjalan (REQ-4.2), pencarian topbar, Daftar Pengaduan, dan semua log tetap menampilkan nomor tersamar.

## Akibat

- Biaya kirim nol, dan tidak ada akun penyedia, deposit, atau HP gateway.
- Pengiriman tidak otomatis. Petugas bisa lupa menghubungi, jadi ada tanda "Belum dihubungi" di Daftar Pengaduan.
- Penelepon tanpa WhatsApp dihubungi lewat tombol Telepon.
- Isi pesan WhatsApp tidak tercatat di SIGAP. Yang tercatat hanya siapa yang menghubungi dan kapan.
- Edge Function `kirim-notifikasi` dan secret `SMS_ADAPTER`/`ZENZIVA_*` di Supabase Cloud perlu dihapus manual setelah migrasi diterapkan.
