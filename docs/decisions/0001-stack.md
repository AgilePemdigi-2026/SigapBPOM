# ADR 0001: Stack Teknologi SIGAP

Status: Diterima, 19 Oktober 2026. Menyelesaikan PRD Bagian 15 butir 1 dan 7.

## Konteks

PRD Bagian 14 mencatat "Stack belum ditetapkan" sebagai risiko Sprint 1. F-01 bergantung pada LLM, STT, dan TTS yang belum dipilih, dan dashboard butuh autentikasi, basis data, serta pembaruan live.

## Keputusan

| Lapisan | Pilihan | Dipakai untuk |
|---|---|---|
| Frontend | Astro | Halaman publik dengan panel "Telepon CS AI", dashboard petugas |
| Backend | Supabase | Postgres (basis data SIGAP), Auth (F-03), Realtime (dashboard live F-04), Storage (ekspor laporan F-08), Edge Functions (REST API dan lapisan control), pgvector (indeks basis pengetahuan F-07) |
| AI Agent | Hermes Agent dengan model GPT melalui langganan | Pengenalan maksud, RAG, tool calling ke cekbpom |
| STT dan TTS | ElevenLabs API (paket premium) | Ucapan Indonesia ke teks dan teks jawaban ke suara, streaming |

Pemetaan ke pola BCE (PROJECT_RULES 4.1):

- Boundary: halaman dan komponen Astro, endpoint Edge Functions.
- Control: modul use case di Edge Functions dan di layanan agen.
- Entity: tabel Postgres beserta enum status dan constraint.

LLM, STT, dan TTS tetap diakses lewat adapter dengan implementasi mock (PROJECT_RULES 4.3), sehingga penyedia bisa diganti tanpa menyentuh kode use case.

## Alternatif

- Backend kustom (Laravel, sesuai SRS yang menyebut Behat): lebih banyak kode untuk autentikasi, realtime, dan penyimpanan yang sudah disediakan Supabase.
- Penyedia STT/TTS lain: belum ada data uji akurasi bahasa Indonesia yang lebih baik dari ElevenLabs untuk kebutuhan tim.

## Konsekuensi

- Bahasa utama TypeScript (Astro dan Edge Functions). Hermes Agent berjalan sebagai layanan terpisah; lokasi hosting-nya ditetapkan saat implementasi.
- Penguncian akun setelah tiga kali gagal (REQ-3.5) tidak tersedia bawaan di Supabase Auth dan harus dibuat sendiri.
- Akses data wajib dijaga Row Level Security di setiap tabel. Kunci `service_role` hanya dipakai di sisi server.
- Model GPT lewat langganan, bukan API berbayar per pemakaian. Tim wajib memastikan syarat layanan langganan mengizinkan pemakaian untuk layanan publik dan memantau batas kuota. Bila tidak, beralih ke OpenAI API cukup dengan mengganti adapter LLM.
- Uji akurasi STT/TTS bahasa Indonesia dengan sampel nama produk BPOM (PRD Bagian 14) tetap dijalankan di Sprint 1, kini terhadap ElevenLabs.
- Kerangka uji penerimaan Gherkin (PRD Bagian 15 butir 9) belum ditetapkan, tetapi Behat (PHP) tidak lagi cocok dengan stack ini.
- Kunci ElevenLabs, OpenAI, dan Supabase hanya lewat environment variable dan dicatat di `.env.example`.
