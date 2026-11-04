# Kontrak API SIGAP

Dokumentasi teknis API untuk tim pengembang dan pemelihara (SRS 2.6 butir 3). Respons JSON memakai format `{ status, message, data }` dengan `status` bernilai `success` atau `error` (PROJECT_RULES 4.4). Pesan yang tampil ke pengguna mengikuti kamus PRD-rinci Lampiran A.

Edge Functions yang dipanggil Voice Gateway tercatat di [supabase/README.md](../supabase/README.md). Dokumen ini memuat endpoint server Astro, Edge Function yang dipanggil server Astro, dan rute Voice Gateway.

## Server Astro `/api/*`

Semua endpoint kecuali `/api/login` berada di balik middleware sesi (`src/middleware.ts`). Tanpa sesi yang sah, atau setelah sesi idle lebih dari 30 menit (NFR-12), balasannya 401 "Akses ditolak.". Token sesi petugas disimpan di cookie HttpOnly dan tidak pernah dipegang JavaScript browser.

| Metode dan path | Body | `data` bila sukses | Galat |
|---|---|---|---|
| `POST /api/login` | `{ email, password }` | `{ nama }`, pesan "Login berhasil!" | 400 body bukan objek JSON; 422 "Login gagal. Semua field harus diisi!"; 401 "Login gagal. Email atau password Anda salah." atau "Akses dikunci sementara. Hubungi administrator."; 429 batas laju per IP (20 per 15 menit, `LOGIN_PERCOBAAN_MAKS`); 503 "Terjadi kesalahan pada sistem." |
| `POST /api/keluar` | - | `null` | - |
| `POST /api/sesi` | - | `null`. Dipanggil browser untuk melaporkan aktivitas petugas | 401 bila sesi sudah berakhir |
| `GET /api/panggilan-berjalan` | - | `{ panggilan: [{ id, noTelp, jenis, topik, waktuMulai, tahap }] }`, nomor telepon tersamar. Di-polling halaman Panggilan Berjalan setiap 5 detik dan pill topbar di setiap halaman dashboard setiap 15 detik, tanpa dihitung sebagai aktivitas | 500 "Data panggilan gagal dimuat." |
| `POST /api/simpan-materi` | `{ judul, kategori?, isi?, rujukan }`, paling besar 256 KB | Diteruskan dari Edge Function `simpan-materi` beserta kodenya | 400 body kosong atau terlalu besar; 4xx dari Edge Function; 500 "Terjadi kesalahan pada sistem." |
| `POST /api/materi/:id/nonaktifkan` | - | `null`, pesan "Materi ditandai tidak aktif." | 400, 404, atau 500 dengan pesan "Materi gagal dinonaktifkan. Muat ulang halaman untuk mencoba lagi." |

## Edge Function yang dipanggil server Astro

Browser tidak memanggil Edge Function. Server Astro memanggilnya dengan header `apikey` berisi kunci anon.

**`login`** (`POST /functions/v1/login`, dari `/api/login`)

- Body `{ email, password }`. Email dinormalkan ke huruf kecil.
- Header `x-sigap-kunci: <SIGAP_KUNCI_LOGIN>` dikirim bila server dashboard punya `SIGAP_KUNCI_LOGIN`. Fungsi hanya memeriksanya bila secret `SIGAP_KUNCI_LOGIN` di Supabase terisi; kunci yang salah atau tidak ada dibalas 401 "Akses ditolak.".
- Sukses 200: `data: { sesi, petugas }`. `sesi` adalah sesi Supabase Auth (`access_token`, `refresh_token`, dan lainnya), `petugas` adalah `{ id, nama }`. Server Astro memeriksa ulang token dan peran petugas sebelum memasang cookie.
- 401 membawa pesan kamus UC-03: isian kosong, kredensial salah, atau akun terkunci setelah tiga kali gagal (REQ-3.5). 503 "Terjadi kesalahan pada sistem." bila Supabase Auth bermasalah, tanpa menambah penghitung gagal login.

**`simpan-materi`** (`POST /functions/v1/simpan-materi`, dari `/api/simpan-materi`)

- Header `Authorization: Bearer <token sesi petugas>`, sehingga RLS `is_petugas()` berlaku. Rincian body dan kode galat ada di [supabase/README.md](../supabase/README.md).

## Voice Gateway `/voice/*`

Dilayani `voice-gateway/server.mjs` di balik reverse proxy (ADR 0004). Alasan bentuk per giliran ada di [ADR 0003](decisions/0003-transport-audio-per-giliran.md). `id` adalah UUID panggilan yang dibuat panel. Bila `SITE_ORIGIN` diisi, setiap POST dari origin lain dibalas 403 "Akses ditolak.". Galat tak terduga dibalas 502 "Layanan suara sedang gangguan. Silakan coba lagi.".

| Metode dan path | Body | Respons sukses | Galat |
|---|---|---|---|
| `GET /voice/kesehatan` | - | `data: { siap, korpus, katalog: { status, materi, nonaktif, tambahan, tanpaKatalog }, hermes, stt, tts, cekbpom: { aktif, sehat?, latensiMs?, waktu? } }`. `hermes`, `stt`, dan `tts` bernilai `{ sehat, latensiMs, waktu }` dari panggilan nyata terakhir, atau null sebelum panggilan pertama sejak gateway mulai. `siap` bernilai true bila kunci ElevenLabs dan Hermes terpasang. Dibaca server dashboard untuk halaman Pantau AI Agent | - |
| `GET /voice/statis/:nama` | - | `audio/mpeg` pesan tetap, dirender sekali lalu di-cache 1 jam. `nama`: `menu`, `layanan-1`, `layanan-2`, `di-luar-topik`, `penutup`, `butuh-petugas`, `ulang-telepon`, `tawaran-penutup`, `jeda`, `minta-nama-produk`, `minta-kronologi`, `minta-nama`, `tidak-ditemukan`, `nama-tidak-jelas` | 404 "Suara tidak ditemukan." |
| `GET /voice/suara/:token` | - | `audio/mpeg` satu kalimat jawaban. Token berasal dari baris `kalimat`, berlaku 2 menit, dan bisa diminta ulang dengan header `Range` | 404 "Suara tidak ditemukan.", 416 rentang tidak valid |
| `POST /voice/giliran` | JSON `{ id, pilih }`, `pilih` 1 atau 2 | `data: { transkrip: null, jawaban, suara }` | 400 "Permintaan tidak valid.", 422 "Pilihan layanan tidak dikenal.", 429 "Terlalu banyak permintaan. Coba lagi sebentar lagi." |
| `POST /voice/giliran` | JSON `{ id, teks }` (teks final STT realtime atau ketikan), atau audio mentah `audio/*` paling besar 4 MB dengan `?id=` | NDJSON, satu objek per baris (lihat di bawah) | Sebelum aliran dimulai: 400, 413 "Rekaman terlalu panjang.", 415 "Format rekaman tidak didukung.", 422 "Suara tidak terdengar. Silakan ulangi." atau ketikan kosong atau terlalu panjang, 429 batas laju atau kuota AI, 409 "Percakapan ini tidak dapat dilanjutkan. Silakan mulai panggilan baru.", 503 "Layanan sedang penuh. Coba lagi sebentar lagi." |
| `POST /voice/stt-realtime` | `{ id }` | `data: { url }`, alamat WSS STT realtime ElevenLabs dengan token sekali pakai | 404 bila `STT_REALTIME=0` atau kunci ElevenLabs kosong (panel lalu memakai rekam lalu unggah), 400, 429 |
| `POST /voice/akhiri` | `{ id }` | `data: null`, atau `{ pesan, tersimpan }` bila pengaduan yang belum lengkap disimpan (REQ-2.5). Juga dikirim lewat `sendBeacon` saat tab ditutup | - |

### Baris NDJSON `POST /voice/giliran`

Respons dimulai dengan status 200 dan `content-type: application/x-ndjson`. Setiap baris adalah objek JSON dengan `jenis`:

| `jenis` | Isi | Keterangan |
|---|---|---|
| `transkrip` | `transkrip`, `jeda?` | Selalu baris pertama. `jeda: true` berarti panel memutar kalimat jeda karena AI dipanggil |
| `cari` | `kueri` | Pencarian cekbpom dimulai, untuk panel Cari Produk |
| `cek` | `kueri`, `total`, `dibaca`, `galat`, `baris` | Tabel hasil cekbpom |
| `kalimat` | `teks`, `suara` | Satu kalimat jawaban. `suara` adalah `/voice/suara/:token`, `/voice/statis/:nama`, atau null bila kuota suara habis |
| `ganti` | - | Kalimat yang sudah dikirim dibuang karena jawaban diganti pesan baku |
| `selesai` | `sumber?`, `produk?`, `tiket?`, `pengaduan?`, `akhiri?`, `layanan?` | Baris terakhir. `akhiri: true` berarti panel menutup panggilan. `layanan` (1 atau 2) berarti ucapan penelepon memilih menu itu, dan panel berpindah ke layanan tersebut. Gateway saat ini hanya mengirim 2, dari ucapan "dua" atau niat mengadu setelah tawaran tekan 2 |
| `galat` | `message` | Galat setelah aliran dimulai, dengan pesan dari kamus Lampiran A |
