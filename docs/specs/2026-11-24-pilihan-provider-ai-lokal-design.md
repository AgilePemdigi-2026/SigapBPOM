# Desain: Pilihan Provider AI (Cloud atau Ollama Lokal)

Tanggal: 2026-11-24
Status: draf, menunggu persetujuan tim
Kaitan: UC-04 Memantau Layanan (F5), ADR 0001 (stack), PROJECT_RULES 4.3, 5, 9

## 1. Maksud dan alasan

Dosen pembimbing meminta AI agent SIGAP bisa memakai model AI lokal agar data percakapan penelepon tidak keluar ke penyedia cloud. Provider yang sudah ada (Hermes Agent dengan model GPT langganan, ADR 0001) tidak dihapus. Admin memilih provider dari dashboard, dan pilihan itu berlaku tanpa mengubah server atau me-restart layanan.

## 2. Tujuan, bukan tujuan, anti-tujuan

Tujuan:

- Admin bisa memilih provider AI: **Cloud** (Hermes + GPT, seperti sekarang) atau **Lokal** (Hermes + Ollama di PC lokal).
- Pilihan berlaku untuk giliran jawaban berikutnya tanpa restart dan tanpa memutus panggilan yang sedang berjalan.
- Dalam mode Lokal, isi percakapan yang dikirim ke model tidak pernah sampai ke penyedia LLM cloud.
- Dashboard menampilkan provider aktif, status perangkat lokal, dan siapa yang terakhir mengganti.

Bukan tujuan:

- STT dan TTS lokal. ElevenLabs tetap dipakai di kedua mode, jadi suara penelepon tetap dikirim ke ElevenLabs. Ini disebut terang di ADR dan di panel dashboard.
- Memilih model Ollama dari dashboard. Model ditetapkan di konfigurasi profil Hermes lokal.
- Mengubah prompt sistem, tool, atau perilaku agent.

Anti-tujuan (gagal walaupun secara teknis berjalan):

- Mode Lokal diam-diam jatuh ke cloud saat Ollama mati.
- Penelepon mendengar jawaban kosong atau pesan galat teknis saat perangkat lokal mati.
- Petugas tanpa hak bisa mengganti provider, misalnya karena tombol hanya disembunyikan di UI.

## 3. Batasan

- **PROJECT_RULES 1.2 dan 9:** fitur ini belum ada di PRD dan tidak termasuk backlog Sprint 3 (UC-05, UC-06, UC-08). Urutannya: tim menyetujui penarikan pekerjaan di pertemuan sprint (9.2.7), lalu PR `docs` memperbarui PRD, PRD-rinci (REQ baru di UC-04 dan teks pesan di Lampiran), serta ADR 0007. Kode menyusul setelahnya.
- **PROJECT_RULES 4.3:** akses LLM lewat interface tunggal dengan implementasi produksi dan mock. Pergantian provider tidak boleh menyentuh kode use case.
- **PROJECT_RULES 4.4, 5.4, 5.7:** endpoint pengubah memakai format `{ status, message, data }`, memeriksa sesi dan hak di server, dan dilindungi CSRF.
- **PROJECT_RULES 4.5:** semua URL, kunci, dan nama model lewat environment variable, dan `.env.example` diperbarui.
- **Perangkat keras lokal:** RTX 4070 12 GB, RAM 32 GB, Ollama 0.40. Model harus muat utuh di VRAM agar latensi suara terjaga (NFR-1, ADR 0005).
- **Jaringan:** Voice Gateway dan Hermes berjalan di VPS, sedangkan Ollama di PC lokal. VPS menjangkau PC lewat Tailscale. Port Ollama tidak dibuka ke internet karena Ollama tidak punya autentikasi.

## 4. Pendekatan yang dipertimbangkan

| Pendekatan | Cara kerja | Trade-off | Keputusan |
|---|---|---|---|
| **A. Dua profil Hermes** | Profil `sigap-cloud` (port 8642, GPT) dan `sigap-lokal` (port 8643, Ollama) dengan prompt dan tool sama. Gateway memilih URL sesuai pilihan admin. | Perpindahan instan, panggilan tidak terputus. Profil lokal tidak menyimpan kunci cloud, jadi data secara fisik tidak bisa keluar. Ada dua proses Hermes yang harus dirawat. | **Dipilih** |
| B. Satu Hermes, config ditulis ulang lalu restart | Dashboard memicu penulisan ulang `config.yaml` Hermes lalu restart. | Memutus panggilan berjalan. Gateway butuh kendali proses Hermes di VPS. Rapuh. | Ditolak |
| C. Satu Hermes, provider ganda atau fallback | Ollama dan GPT terdaftar di satu Hermes, dipilih lewat field `model` atau fallback. | Belum terbukti Hermes memilih provider per request lewat field `model`. Ada laporan routing jatuh ke OpenRouter walau provider diset `custom` (NousResearch/hermes-agent#12146). Kunci cloud ada di proses yang sama, jadi jaminan mode Lokal bergantung pada Hermes bebas bug. | Ditolak |

Alasan memilih A: hanya A yang perpindahannya instan sekaligus menjamin mode Lokal tidak bisa menghubungi cloud, dan argumen itulah yang diminta dosen.

## 5. Rancangan

### 5.1 Infrastruktur (VPS dan PC lokal)

- **Profil `sigap-cloud`:** Hermes yang sudah berjalan sekarang di `:8642`. Tidak diubah.
- **Profil `sigap-lokal`:** salinan konfigurasi `sigap-cloud` (prompt, skill, tool) di `:8643` dengan:
  - `provider: custom`, `base_url: http://<ip-tailscale-pc>:11434/v1`, model `gemma3:12b`;
  - tanpa `fallback_model`, tanpa kunci OpenAI, OpenRouter, atau kunci cloud lain di `.env` profil;
  - kunci API server sendiri, berbeda dari profil cloud.
- **PC lokal:** Ollama dengan `OLLAMA_HOST=0.0.0.0` dan `OLLAMA_KEEP_ALIVE=-1`, supaya model tetap di VRAM dan tidak ada jeda muat ulang sekitar 10 detik. Windows Firewall hanya mengizinkan port 11434 dari antarmuka Tailscale.
- **Model:** `qwen3:8b` (sekitar 5 GB) dengan mode thinking dimatikan. Hermes Agent butuh tool calling, dan di Ollama `qwen3` mendukung tools sedangkan `gemma3` tidak. Cadangan bila kualitas jawaban kurang: `qwen3:14b` (sekitar 9 GB, masih muat di VRAM, latensi lebih tinggi). Pilihan akhir ditetapkan lewat uji latensi dan uji jawaban bahasa Indonesia. Model `qwen3-abl-tools` yang sudah ada tidak dipakai: 16 GB melebihi VRAM, dan versi *abliterated* sudah dicabut filter keamanannya.
- **Uji awal profil lokal:** sebelum kode gateway dikerjakan, satu panggilan uji ke `sigap-lokal` dengan pertanyaan yang memicu tool `cek-registrasi` harus berhasil. Kalau gagal, model diganti sebelum lanjut.
- **Verifikasi kebocoran:** saat uji terima, profil lokal dijalankan dengan lalu lintas keluar VPS dipantau (atau Tailscale ACL hanya mengizinkan PC lokal). Satu panggilan penuh dalam mode Lokal tidak boleh menghasilkan koneksi ke host penyedia LLM.

### 5.2 Basis data (Supabase)

- Enum `provider_ai` dengan nilai `cloud` dan `lokal`.
- Tabel `pengaturan_ai`, satu baris saja:
  - `id boolean primary key default true check (id)`
  - `provider provider_ai not null default 'cloud'`
  - `diubah_oleh uuid references petugas(id)`
  - `diubah_pada timestamptz not null default now()`
- Kolom baru `petugas.hak_atur_ai boolean not null default false`, mengikuti pola `hak_ekspor`. SIGAP belum punya peran admin (PRD-rinci Bagian 15 butir 8), jadi hak ini menjadi penandanya. `supabase/seed.sql` memberi hak ini ke akun petugas seed yang juga punya `hak_ekspor`, supaya skenario Gherkin bisa berjalan. Di produksi hak diberikan manual lewat Supabase Studio.
- RLS: `select` untuk `is_petugas()`. Tidak ada `update` langsung. Perubahan hanya lewat RPC `ubah_provider_ai(p provider_ai)` (security definer) yang memeriksa `hak_atur_ai` milik `auth.uid()`, lalu mengisi `diubah_oleh` dan `diubah_pada`.
- Edge Function baru `provider-ai` (GET, kunci `SIGAP_KUNCI_INTERNAL`) agar gateway bisa membaca pilihan, mengikuti pola `katalog-materi`.

### 5.3 Voice Gateway

- Interface `PemilihProviderAi` dengan metode `aktif(): Promise<'cloud' | 'lokal'>`:
  - `PemilihProviderSupabase`: membaca Edge Function `provider-ai`, cache 5 detik. Kalau pembacaan gagal, nilai terakhir dipakai. Kalau belum pernah berhasil sejak start, hasilnya `tidak_diketahui`, dan giliran AI tidak dikirim ke profil mana pun: agent langsung ke jalur `butuhPetugas`. Ini menutup celah "gateway restart saat Supabase putus lalu diam-diam memakai cloud".
  - `PemilihProviderTiruan`: nilai dari `AI_PROVIDER_BAWAAN`, untuk lokal, test, dan demo. Tidak dipakai di produksi.
- Env baru: `HERMES_LOKAL_URL`, `HERMES_LOKAL_API_KEY`, `HERMES_LOKAL_MODEL`, `OLLAMA_URL` (khusus pemeriksaan kesehatan), `AI_PROVIDER_BAWAAN` (hanya untuk tiruan, bawaan `cloud`). `HERMES_URL`, `HERMES_API_KEY`, dan `HERMES_MODEL` tetap untuk profil cloud.
- Provider dibaca di setiap giliran, bukan di awal panggilan. Jadi saat admin pindah ke Lokal, giliran berikutnya dari panggilan yang sedang berjalan langsung memakai Lokal.
- `aliranHermes` menerima target (URL, kunci, model) dari pemilih. Kode use case tidak tahu provider mana yang dipakai.
- **Mode Lokal gagal** (koneksi ditolak, timeout, status non-200, atau pemberitahuan "No reply" Hermes):
  - Agent mengucapkan satu pesan `PESAN_LOKAL_MATI` (teks di 5.5). Pesan ini menggantikan `PESAN_BUTUH_PETUGAS` untuk giliran itu dan sudah memuat permintaan nomor telepon.
  - Status panggilan masuk jalur `butuhPetugas` yang sudah ada. Tiket ESK terbit di giliran berikutnya setelah penelepon menyebut nomor yang sah, sama seperti eskalasi sekarang.
  - Kegagalan di tengah aliran, setelah sebagian kalimat terucap, juga dihitung gagal: kalimat yang belum terputar dibuang (event `ganti`, seperti jawaban baku), lalu `PESAN_LOKAL_MATI` diucapkan.
  - Tidak ada percobaan ke profil cloud.
  - Kegagalan dicatat di kondisi `hermes` agar terlihat di Pantau AI Agent.
- **Pemeriksaan kesehatan perangkat lokal:** gateway memanggil `GET {OLLAMA_URL}/api/tags` setiap 30 detik, dengan batas waktu 3 detik, di kedua mode. Hasilnya (`aktif` atau `mati` dan latensinya) menjadi `hermesLokal` di `/voice/kesehatan`, sehingga status tetap segar walaupun mode Cloud sedang dipakai.
- **Ringkasan tiket** (`PeringkasHermes`) memakai provider aktif. Kalau mode Lokal gagal, dipakai `PeringkasTiruan` (tanpa AI), bukan cloud.
- `GET /voice/kesehatan` menambah `provider` (pilihan aktif) dan `hermesLokal` (hasil panggilan nyata terakhir ke profil lokal).

### 5.4 Dashboard (Pantau AI Agent)

Panel baru "Provider AI" di atas tampilan Kantor/Tabel:

```
┌ Provider AI ─────────────────────────────────────────────┐
│ (•) Cloud (GPT)      ( ) Lokal (Ollama)      [Simpan]    │
│ Perangkat lokal: ● Aktif · 840 ms                        │
│ Terakhir diubah: Hariz, 24 Nov 2026 14.05                │
│ Catatan: suara tetap diproses ElevenLabs di kedua mode.  │
└──────────────────────────────────────────────────────────┘
```

- Pilihan dinonaktifkan bagi petugas tanpa `hak_atur_ai`. Server tetap menolak lewat RPC.
- Memilih Lokal saat perangkat lokal berstatus mati tetap diizinkan, dengan konfirmasi bahwa panggilan akan dieskalasi selama perangkat mati.
- Endpoint `POST /api/provider-ai` (sesi, CSRF, validasi enum) memanggil RPC dan mengembalikan `{ status, message, data }`.
- Komponen kesehatan menambah baris "AI Lokal".

### 5.5 Teks pesan (masuk Lampiran PRD-rinci lewat PR docs)

Usulan, menunggu persetujuan tim:

- Ucapan agent (`PESAN_LOKAL_MATI`): "Mohon maaf, perangkat AI lokal sedang tidak aktif. Pertanyaan Anda akan kami teruskan ke petugas. Mohon sebutkan nomor telepon Anda."
- Konfirmasi dashboard: "Perangkat AI lokal sedang tidak aktif. Selama mode Lokal dipakai, panggilan akan diteruskan ke petugas. Lanjutkan?"
- Sukses simpan: "Provider AI berhasil diubah."
- Tanpa hak: "Anda tidak memiliki hak mengubah provider AI."

### 5.6 Pengujian

- Unit (gateway): pemilih membaca dan meng-cache. Galat baca memakai nilai terakhir. Routing giliran ke URL yang benar. Mode Lokal gagal mengucapkan pesan lalu eskalasi tanpa memanggil cloud (mock Hermes cloud yang gagal test bila dipanggil). Ringkasan jatuh ke tiruan.
- pgTAP: `ubah_provider_ai` ditolak tanpa `hak_atur_ai`, `update` langsung ditolak RLS, `anon` tidak bisa membaca.
- Unit (Astro): `POST /api/provider-ai` menolak tanpa sesi, tanpa CSRF, dan dengan nilai di luar enum.
- Gherkin UC-04: admin memilih Lokal, panggilan dijawab profil lokal (mock), perangkat lokal mati, penelepon mendengar pesan dan tiket ESK terbit.

### 5.7 Dokumentasi

- ADR 0007: provider AI lokal, dua profil Hermes, batasan STT/TTS tetap cloud.
- PRD dan PRD-rinci: REQ baru di UC-04, teks pesan, tabel antarmuka eksternal (Ollama).
- README dan `voice-gateway/.env.example`: env baru dan langkah menyiapkan profil `sigap-lokal`, Tailscale, dan Ollama.

## 6. Diserahkan ke pembangun

- Nama dan nomor REQ baru, serta pemecahan task di `docs/prd/tasks.json`.
- Tata letak rinci panel mengikuti komponen dashboard yang ada.
- Batas waktu giliran mode Lokal. Bawaannya sama dengan `BATAS_WAKTU_HERMES_MS`, lalu disetel setelah uji latensi.

## 7. Keputusan penulis yang perlu dicek

- Hak mengganti provider memakai kolom `hak_atur_ai`, karena belum ada peran admin.
- Provider dibaca per giliran dengan cache 5 detik, bukan dikunci per panggilan.
- Saat gateway baru start dan pilihan provider belum terbaca, panggilan dieskalasi, tidak memakai cloud.
- Model utama `qwen3:8b`, karena Hermes butuh tool calling.
- Kegagalan di tengah aliran membuang sisa jawaban lalu mengucapkan `PESAN_LOKAL_MATI`.
- Kesehatan perangkat lokal diperiksa langsung ke Ollama setiap 30 detik.
- Hak awal `hak_atur_ai` lewat seed untuk lokal dan lewat Studio untuk produksi.
- Riwayat perubahan hanya baris terakhir (`diubah_oleh`, `diubah_pada`), tanpa tabel histori.
- Dokumen disimpan di `docs/specs/`.
