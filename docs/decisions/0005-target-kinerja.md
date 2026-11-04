# ADR 0005: Target Kinerja dan Cara Mengukurnya

Status: Diusulkan, 4 November 2026. Menyelesaikan PRD Bagian 15 butir 6 (SRS Appendix C butir 6) setelah diterima tim dan baris VPS di tabel Hasil terisi.

## Konteks

SRS 5.1 dan 5.4 menetapkan target kinerja berikut, dan PRD-rinci Bagian 3 menyalinnya. PRD Bagian 15 butir 6 menunda nilai finalnya sampai uji beban.

| Kode | Target SRS |
|---|---|
| NFR-1 | Jawaban suara mulai paling lambat 3 detik setelah penelepon selesai berbicara, pada 95% interaksi. |
| NFR-3 | Setiap halaman dashboard termuat paling lambat 3 detik pada koneksi 10 Mbps. |
| NFR-4 | Paling sedikit 50 panggilan simultan tanpa waktu respons melewati batas yang ditetapkan. |
| NFR-16 | Layanan suara dan dashboard tersedia paling sedikit 99% selama jam layanan HaloBPOM. |

Sebelum ADR ini repo belum punya pengukuran untuk keempatnya. Satu-satunya angka adalah tiga panggilan di badan PR #44, yang diukur di VPS sebelum 54f223a.

## Keputusan (usulan)

- Nilai target SRS dipertahankan. Batas 3000 ms ditulis sebagai konstanta bernama: `BATAS_NFR_1_MS` di `voice-gateway/ujiKinerja.mjs` dan `BATAS_NFR_3_MS` di `scripts/ukur-muat-dashboard.ts`.
- NFR-1 dinilai pada audio pertama jawaban itu sendiri, bukan kalimat jeda "Baik, sebentar saya cek ya.". Waktu kalimat jeda tetap dilaporkan terpisah.
- Untuk "95% interaksi", giliran yang berakhir galat dihitung gagal (lebih dari 3 detik). Giliran yang diputus penelepon tidak dihitung.
- NFR-4 memakai batas NFR-1: p95 waktu audio kalimat pertama pada 50 sesi serentak paling lama 3000 ms, tanpa galat.
- NFR-16 dihitung 24 jam sehari sampai BPOM menetapkan jam layanan HaloBPOM. Angka ini lebih ketat dari jam kerja mana pun. Pemantauan dilakukan dari luar VPS.
- PRD-rinci Bagian 15 butir 6 dan README diperbarui setelah ADR ini diterima.

## Metode

### NFR-1: waktu respons suara

Gateway menulis satu baris log per giliran untuk semua jalur (AI, cek registrasi, pengaduan, eskalasi, menu, saring, penutup):
`{"ev":"respons","stt_ms":...,"kalimat1_ms":...}`. `kalimat1_ms` dihitung dari permintaan giliran diterima sampai baris kalimat pertama dikirim ke panel. Nilai null berarti tidak ada kalimat yang terucap, karena galat atau karena penelepon memutus sebelum kalimat pertama.

```
docker compose logs voice | node voice-gateway/ujiKinerja.mjs log
```

Angka dari log ini adalah **batas bawah**. Yang tidak tercakup:

- jeda hening 0,8 detik sebelum VAD menutup ucapan (`voice-gateway/sttRealtime.mjs`, `vad_silence_threshold_secs`);
- commit STT realtime. Panel mengirim teks hasil STT realtime sebagai giliran ketik, sehingga `stt_ms` bernilai 0;
- jaringan antara browser dan VPS;
- render TTS penuh kalimat pertama dan unduhan audionya. Sejak 54f223a, `/voice/suara` baru mengirim audio setelah render selesai, agar Safari bisa memutarnya.

Angka penentu NFR-1 diukur di sisi klien, yaitu `t_suara1` dari perintah berikut ditambah 0,8 detik VAD dan waktu commit STT realtime:

```
node voice-gateway/ujiKinerja.mjs beban --gateway https://<domain> --serentak 1
```

`t_suara1` adalah waktu dari giliran dikirim sampai audio kalimat pertama diterima utuh. `t_jeda` (baris transkrip bertanda jeda; audio jedanya statis dan sudah tersimpan) dan `t_kalimat1` dilaporkan terpisah. Mode log tidak bisa mengukur kalimat jeda.

Keluaran `ringkas()` memisahkan giliran tanpa kalimat sebagai `tanpa`. Vonis memakai pembacaan konservatif: setiap giliran `tanpa` dihitung lebih dari 3 detik, kecuali log `giliran` di dekatnya bertanda `"batal":true`.

### NFR-3: waktu muat dashboard

```
SIGAP_UI_URL=<url> SIGAP_EMAIL=<akun petugas> SIGAP_PASSWORD=<password> node scripts/ukur-muat-dashboard.ts
```

Skrip login lewat formulir `/login`, lalu membuka setiap halaman NAV dan `/pantau-ai-agent` sebanyak `ULANG` kali (bawaan 5) di Chrome. Lewat CDP, jaringan dibatasi 10 Mbps naik dan turun dengan latensi tambahan 0 ms, dan cache dimatikan. Angka yang dipakai adalah `loadEventEnd` navigasi. Halaman lulus bila nilai maksimumnya paling lama 3000 ms. Kredensial hanya diambil dari env.

Setiap request dashboard memanggil Supabase Auth (`/auth/v1/user`, lalu `is_petugas` dan `petugas`). Build produksi lokal dengan Supabase lokal mengecilkan waktu putar balik itu, jadi hasil lokal diberi label lokal, dan yang menentukan adalah hasil terhadap VPS. Terhadap VPS, latensi jaringan nyata ikut terhitung di atas pembatasan 10 Mbps.

### NFR-4: panggilan simultan

`node voice-gateway/ujiKinerja.mjs beban` menjalankan `server.mjs` di port bebas dengan pengaturan berikut:

- Hermes (SSE) dan ElevenLabs TTS tiruan lewat `HERMES_URL` dan `ELEVENLABS_URL`;
- adapter Supabase tiruan dan cekbpom mati;
- korpus seluruh `knowledge/`, sama dengan produksi;
- kuota harian gateway tidak dibatasi.

Setiap sesi memakai IP sendiri lewat `X-Forwarded-For`, menekan 1, mengetik tiga pertanyaan F1, lalu mengakhiri panggilan. Uji berjalan dalam dua fase: serentak 1, lalu serentak 50.

Ada dua asumsi tiruan: token pertama Hermes 1600 ms (diukur di VPS, PR #44) dan render TTS penuh 500 ms per kalimat. Angka TTS ini asumsi dan diganti hasil ukur VPS setelah ada. Proses keluar dengan kode 1 bila p95 `t_suara1` pada fase terakhir lebih dari 3000 ms atau ada galat.

### NFR-16: ketersediaan

Dua probe berjalan dari luar VPS setiap 5 menit:

- Layanan suara: `GET https://<domain>/voice/kesehatan`, sehat bila HTTP 200 dan memuat `"siap":true`. `siap` hanya berarti kunci Hermes dan ElevenLabs terpasang. Hasil panggilan nyata terakhir (`hermes`, `stt`, `tts`, sejak 5150a39) bersifat pasif dan bernilai null setelah restart, jadi tidak dipakai sebagai kata kunci probe.
- Dashboard: `GET https://<domain>/login`, sehat bila HTTP 200.

Ketersediaan bulanan adalah jumlah probe sehat dibagi jumlah seluruh probe, dihitung terpisah untuk keduanya dan dirangkum per bulan di ADR ini.

## Hasil

| NFR | Target SRS | Hasil | Lingkungan | Tanggal | Status |
|---|---|---|---|---|---|
| NFR-4 | ≥ 50 simultan, p95 ≤ 3 dtk | 50 sesi × 3 giliran, diulang tiga kali: p95 `t_suara1` 2208, 2214, dan 2122 ms (maks 2221 ms); galat 0. Pada serentak 1: 2137 sampai 2141 ms. p95 `kalimat1_ms` di server 1610 sampai 1631 ms. | Lokal, adapter tiruan (Hermes 1600 ms, TTS 500 ms), korpus 21.859 potongan, Apple M5 10 inti, Node 26.3 | 4 Nov 2026 | Lulus untuk sisi gateway saja |
| NFR-4 | (ruang sisa) | 150 sesi × 3 giliran: p95 `t_suara1` 2265 ms, galat 0 | Sama dengan baris di atas | 4 Nov 2026 | Info |
| NFR-1 | p95 ≤ 3 dtk | p95 `t_suara1` 2,14 dtk pada serentak 1. Ditambah 0,8 dtk VAD menjadi 2,94 dtk, belum termasuk commit STT realtime dan jaringan. | Lokal, adapter tiruan | 4 Nov 2026 | Belum dinilai (latensi penyedia masih asumsi) |
| NFR-1 | p95 ≤ 3 dtk | Kalimat pertama 2,71 sampai 4,38 dtk; kalimat jeda 0,5 sampai 1,1 dtk | VPS, badan PR #44, n=3, sebelum 54f223a, tanpa jeda VAD 0,8 dtk | Sebelum 3 Nov 2026 | Indikatif |
| NFR-1 | p95 ≤ 3 dtk | Menunggu | VPS: `beban --gateway --serentak 1` dan log `respons` setelah deploy | - | Menunggu |
| NFR-3 | ≤ 3 dtk per halaman pada 10 Mbps | Belum diukur | Lokal (butuh akun petugas) dan VPS | - | Menunggu |
| NFR-16 | ≥ 99% | Pemantau belum terpasang | VPS | - | Menunggu |

Pada 50 sampai 150 sesi serentak, gateway hanya menambah sekitar 20 sampai 165 ms di atas latensi tiruan Hermes dan TTS (2100 ms). Jadi NFR-1 dan NFR-4 ditentukan oleh latensi dan batas serentak penyedia, bukan oleh CPU gateway. Dengan asumsi tiruan, sisa waktu NFR-1 setelah VAD hanya sekitar 60 ms untuk commit STT dan jaringan. Vonisnya menunggu angka VPS.

## Alternatif

- Mengukur NFR-1 dari permintaan diterima server: lebih mudah lulus, tetapi tidak sesuai bunyi SRS ("setelah penelepon selesai berbicara"). Tidak dipilih.
- Menghitung kalimat jeda sebagai awal jawaban: menurut PR #44 kalimat jeda terdengar dalam 0,5 sampai 1,1 detik, jadi NFR-1 hampir pasti lulus. Namun kalimat jeda bukan jawaban, sehingga hanya dilaporkan dan tidak dipakai untuk vonis, kecuali PO memutuskan lain.
- Uji beban 50 panggilan dengan Hermes dan ElevenLabs asli: menghabiskan kuota, dan dari satu host dibatasi batas per IP di balik Caddy. Tidak dipilih untuk uji rutin.
- Menyimpan hasil di `docs/kinerja.md` tanpa ADR: PROJECT_RULES 7 mewajibkan butir Bagian 15 diselesaikan lewat ADR.
- Pemantau uptime dengan cron di VPS yang sama tidak bisa mendeteksi VPS mati. Uptime Kuma di host lain setara dengan layanan pemantau eksternal, tetapi menambah satu host yang harus dirawat. Usulan: layanan pemantau eksternal paket gratis (misalnya UptimeRobot atau Better Stack).

## Konsekuensi

- Kapasitas NFR-4 yang nyata dibatasi kuota dan paket penyedia, bukan gateway:
  - `TTS_KARAKTER_HARIAN` bawaan 6000 karakter cukup untuk sekitar 20 sampai 40 jawaban dinamis per hari.
  - `AI_TOKEN_HARIAN` bawaan 500.000 cukup untuk sekitar 138 giliran AI per hari (sekitar 3.600 token per giliran). Uji beban sengaja menaikkan kedua kuota ini.
  - Batas per IP adalah 3 giliran serentak dan 30 giliran per 5 menit. Penelepon di balik satu NAT, misalnya satu kantor, berbagi batas ini.
  - Dengan `STT_REALTIME=1` (bawaan), setiap panggilan aktif membuka satu WebSocket STT realtime ElevenLabs dari browser. Jadi 50 panggilan butuh 50 sesi STT realtime serentak pada paket ElevenLabs, ditambah render TTS serentak. Langganan Hermes juga harus menerima 50 aliran serentak. Uji tiruan tidak menguji batas-batas ini.
- Bila NFR-1 gagal di VPS, perbaikan pertama adalah mengalirkan permintaan pertama `/voice/suara` tanpa menunggu render selesai, sambil tetap menyimpan buffer untuk permintaan Range Safari. Ini isu terpisah.
- `ELEVENLABS_URL` hanya dipakai uji beban. Produksi memakai nilai bawaan `https://api.elevenlabs.io`. STT realtime (`sttRealtime.mjs`) tidak ikut diarahkan ke tiruan karena uji beban memakai giliran ketik.
- `ujiKinerja.mjs` tidak ikut image Docker, karena Dockerfile menyalin berkas gateway satu per satu.

## Belum dikerjakan

Butir berikut butuh akses VPS, akun penyedia, atau keputusan PO:

- Deploy log `respons` ke VPS, kumpulkan sedikitnya 20 giliran per jalur, lalu jalankan mode `log`.
- Jalankan `beban --gateway https://<domain> --serentak 1` terhadap Hermes dan ElevenLabs asli. Kuota penyedia akan terpakai.
- Ukur NFR-3 secara lokal dengan akun petugas seed, lalu terhadap VPS dengan akun petugas di Supabase Cloud. Pengukuran VPS sebaiknya menunggu PR #112 sampai #114, karena halaman Riwayat Percakapan, Daftar Pengaduan, dan Rekap & Laporan masih placeholder.
- Pasang pemantau eksternal dan kumpulkan data sedikitnya satu bulan.
- Catat nilai kuota di env VPS, batas serentak paket ElevenLabs (STT realtime dan TTS), dan batas langganan Hermes.
- PO mengonfirmasi aturan kalimat jeda, aturan giliran galat dan batal, jam layanan HaloBPOM, dan anggaran kuota.
