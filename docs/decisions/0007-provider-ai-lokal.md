# ADR 0007: Provider AI Lokal (Hermes + Ollama) yang Dipilih Admin dari Dashboard

Status: Diterima, 25 November 2026. Penarikan pekerjaan ini ke Sprint 3 disetujui tim di pertemuan sprint (PROJECT_RULES 9.2.7). Teks pesan di Lampiran A PRD-rinci masih usulan sampai tim menyetujuinya.

## Konteks

ADR 0001 menetapkan Hermes Agent dengan model GPT langganan sebagai AI Agent. Dosen pembimbing meminta SIGAP bisa memakai model AI lokal, supaya isi percakapan penelepon tidak keluar ke penyedia LLM cloud. Provider cloud tidak dihapus. Admin memilih provider dari dashboard, dan pilihan itu berlaku tanpa mengubah server atau me-restart layanan.

Batasan yang membentuk keputusan:

- PROJECT_RULES 4.3: akses LLM lewat interface tunggal dengan implementasi produksi dan mock. Pergantian provider tidak boleh menyentuh kode use case.
- Hardware lokal: RTX 4070 12 GB, RAM 32 GB, Ollama 0.40. Model harus muat utuh di VRAM agar latensi suara terjaga (NFR-1, ADR 0005).
- Voice Gateway dan Hermes berjalan di VPS, sedangkan Ollama di PC lokal. Ollama tidak punya autentikasi, jadi port 11434 tidak boleh dibuka ke internet.
- SIGAP belum punya peran admin (PRD-rinci Bagian 15 butir 8).

## Keputusan

- Dua profil Hermes di VPS dengan prompt, skill, dan tool yang sama:
  - `sigap-cloud` di `:8642` (GPT, tidak diubah);
  - `sigap-lokal` di `:8643` dengan `provider: custom` ke Ollama, tanpa `fallback_model`, dan tanpa kunci OpenAI, OpenRouter, atau kunci cloud lain di `.env` profil. Kunci API server profil ini berbeda dari profil cloud.
- Voice Gateway membaca pilihan admin di setiap giliran lewat interface `PemilihProviderAi` (cache 5 detik) dan mengirim giliran ke profil yang sesuai. Kalau pilihan belum pernah terbaca sejak gateway start, giliran tidak dikirim ke profil mana pun: agent langsung eskalasi.
- Pilihan disimpan di tabel satu baris `pengaturan_ai`. Perubahan hanya lewat RPC `ubah_provider_ai`, yang memeriksa kolom `petugas.hak_atur_ai`. Kolom ini mengikuti pola `hak_ekspor` dan menjadi penanda admin sampai ada peran admin.
- Mode Lokal yang gagal (koneksi ditolak, timeout, status non-200, atau pemberitahuan "No reply" Hermes) tidak pernah jatuh ke cloud. Agent mengucapkan `PESAN_LOKAL_MATI`, lalu panggilan masuk jalur eskalasi yang sudah ada.
- PC lokal menjalankan Ollama dengan `OLLAMA_HOST=0.0.0.0` dan `OLLAMA_KEEP_ALIVE=-1`. VPS menjangkau PC lewat Tailscale, dan Windows Firewall hanya mengizinkan port 11434 dari antarmuka Tailscale.
- Model utama `qwen3:8b` dengan thinking dimatikan. Hermes butuh tool calling, dan di Ollama `qwen3` mendukung tools sedangkan `gemma3` tidak. Cadangan: `qwen3:14b`. Pilihan akhir ditetapkan lewat uji latensi dan uji jawaban bahasa Indonesia. Model `qwen3-abl-tools` tidak dipakai: 16 GB melebihi VRAM dan versi abliterated sudah dicabut filter keamanannya.
- Kesehatan perangkat lokal diperiksa gateway langsung ke `GET {OLLAMA_URL}/api/tags` setiap 30 detik (batas 3 detik), di kedua mode.
- STT dan TTS tetap ElevenLabs di kedua mode. Suara penelepon tetap dikirim ke ElevenLabs. Hal ini disebut terang di panel dashboard, dan bukan klaim "semua data tetap lokal".

## Alternatif yang ditolak

| Alternatif | Alasan ditolak |
|---|---|
| Satu Hermes, `config.yaml` ditulis ulang lalu restart | Memutus panggilan berjalan, gateway butuh kendali proses Hermes di VPS, dan rapuh. |
| Satu Hermes dengan provider ganda atau fallback, dipilih lewat field `model` | Belum terbukti Hermes memilih provider per request. Ada laporan routing jatuh ke OpenRouter walau provider diset `custom` (NousResearch/hermes-agent#12146). Kunci cloud ada di proses yang sama, sehingga jaminan mode Lokal bergantung pada Hermes bebas bug. |
| Peran admin penuh untuk hak ganti provider | Di luar cakupan: manajemen akun petugas tidak ada di PRD. Kolom `hak_atur_ai` cukup. |

## Akibat

- Perpindahan provider instan dan panggilan yang sedang berjalan tidak terputus. Giliran berikutnya (paling lama 5 detik kemudian) memakai provider baru.
- Profil `sigap-lokal` secara fisik tidak punya kunci cloud, jadi mode Lokal tidak bisa menghubungi penyedia LLM cloud. Jaminan ini diverifikasi saat uji terima dengan memantau lalu lintas keluar VPS selama satu panggilan penuh.
- Ada dua proses Hermes yang harus dirawat. Perubahan prompt, skill, atau tool harus diterapkan ke kedua profil.
- Mode Lokal bergantung pada PC lokal dan Tailscale yang menyala. Kalau mati, panggilan dieskalasi ke petugas selama perangkat mati, dan dashboard menampilkan statusnya.
- Kualitas jawaban model lokal bisa lebih rendah daripada GPT. Pemilihan model akhir ditentukan lewat uji.
- Nilai baru di gateway: `HERMES_LOKAL_URL`, `HERMES_LOKAL_API_KEY`, `HERMES_LOKAL_MODEL`, `OLLAMA_URL`, `AI_PROVIDER_BAWAAN`. Semuanya lewat environment variable (PROJECT_RULES 4.5).
- Riwayat perubahan hanya baris terakhir (`diubah_oleh`, `diubah_pada`), tanpa tabel histori.
- Hak awal `hak_atur_ai` diberikan lewat `supabase/seed.sql` untuk lokal dan lewat Supabase Studio untuk produksi.

Rancangan lengkap: `docs/specs/2026-11-24-pilihan-provider-ai-lokal-design.md`.
