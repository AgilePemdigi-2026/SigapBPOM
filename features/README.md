# Uji penerimaan BDD (Gherkin)

Skenario penerimaan per use case ditulis dalam Gherkin dan dijalankan dengan Cucumber.js (ADR 0002). Ada tiga jenis:

| Perintah | Isi | Butuh |
|---|---|---|
| `npm run test:bdd` | Skenario control (tanpa tag): langkahnya memanggil lapisan control dengan adapter tiruan | Tidak ada, cepat |
| `npm run test:bdd:ui` | Skenario `@ui`: teks SRS Lampiran F apa adanya, dijalankan lewat browser (Playwright) terhadap dashboard dan panel suara yang sedang berjalan, seperti Behat dengan Mink | Stack lokal di bawah |
| `npm run test:bdd:live` | Skenario `@live`: memanggil layanan luar asli (cekbpom) | Internet |

Skenario control yang ada: UC-01 (cek registrasi dan tool `cek_registrasi_bpom`), UC-05 (Tabel B.6), UC-06 (Tabel B.7), dan UC-08 (Tabel B.9). Langkah dashboard Sprint 3 ditulis seperti SRS ("petugas mengisi", "petugas memilih", "petugas menekan"); aksi setiap tombol berlabel Lampiran B didaftarkan file langkah UC lewat `features/support/dashboard.mjs`. Bila halamannya belum dibuat, elemen Lampiran B (misalnya `TranskripPercakapan` atau `TabelRekapitulasi`) diperiksa dari data yang disiapkan control untuk elemen itu.

Skenario `@belum-tersedia` menunggu bagian yang belum dibuat, sehingga tidak ikut `npm run test:bdd`. Daftarnya bisa dilihat dengan `npx cucumber-js --profile belum` (langkahnya berstatus pending). Tag dicabut begitu bagian itu masuk main:

| Skenario | Menunggu |
|---|---|
| UC-06 StepperPenanganan menampilkan tahapan penanganan | Panel penanganan di Detail Pengaduan (T-F7.2-02) |
| UC-06 SMS tindak lanjut terkirim kepada pelapor | Notifikasi SMS saat tiket ditutup (T-F7.3-01) |
| UC-08 Berkas laporan terunduh | Penyusunan berkas PDF dan CSV, `GET /api/laporan` (T-F8.2-01) |

Skenario `@ui` yang ada: UC-02 (Tabel B.3), UC-03 (Tabel B.4), UC-04 (Tabel B.5), dan UC-07 (Tabel B.8).

## Menjalankan skenario `@ui`

1. Supabase lokal dengan seed terbaru (akun uji `petugas@halobpom.go.id` dari Tabel B.4 ada di `supabase/seed.sql`):

   ```bash
   supabase start
   supabase db reset
   ```

2. Edge Functions dengan kunci internal lokal. Isi `supabase/functions/.env` (salin dari `.env.example`), misalnya `SIGAP_KUNCI_INTERNAL=kunci-uji-lokal`, lalu:

   ```bash
   supabase functions serve --env-file supabase/functions/.env
   ```

3. Voice Gateway, dibutuhkan UC-02. Alur pengaduan tidak memakai AI, jadi kunci ElevenLabs dan Hermes tidak perlu. Batas tiket harian dilonggarkan karena skenario mengirim nomor telepon yang sama berulang kali:

   ```bash
   PORT=8090 SUPABASE_URL=http://127.0.0.1:54321 SIGAP_KUNCI_INTERNAL=kunci-uji-lokal KORPUS_DIR=knowledge TIKET_HARIAN_PER_NOMOR=1000 TIKET_HARIAN_PER_IP=1000 node voice-gateway/server.mjs
   ```

4. Dashboard. `SUPABASE_URL` dan `SUPABASE_ANON_KEY` harus ada di environment proses (lihat `supabase status -o env`), bukan hanya di `.env`. Batas login per IP dilonggarkan karena satu run login belasan kali. Dev server meneruskan `/voice/*` ke gateway di port 8090.

   ```bash
   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<anon key lokal> LOGIN_PERCOBAAN_MAKS=1000 npm run dev
   ```

5. Jalankan skenario:

   ```bash
   npm run test:bdd:ui
   ```

   - `SIGAP_UI_URL` mengatur alamat dashboard (bawaan `http://localhost:4321`).
   - Browser yang dipakai adalah Google Chrome yang terpasang. Tanpa Chrome, jalankan `npx playwright install chromium` lalu pakai `PW_CHANNEL=chromium`.
   - `PW_HEADED=1` menampilkan jendela browser selama uji.
   - Setiap langkah tampil di terminal dengan tanda lulus atau gagal, dan laporan HTML tersimpan di `test-results/bdd-ui/laporan.html`.
   - Skenario yang gagal meninggalkan tangkapan layar di `test-results/bdd-ui/`.

Di Windows (PowerShell), environment diisi dengan `$env:NAMA="nilai"` sebelum perintahnya, dan `supabase` harus ada di PATH karena langkah data uji memanggil `supabase db query --local`.

## Pemetaan langkah SRS ke browser

Langkah ditulis sama persis dengan SRS (`features/step_definitions/web.steps.mjs`). Ada tiga hal yang tidak bisa dilakukan browser uji secara harfiah:

- `I should hear "..."`: setiap kalimat yang diucapkan agen juga ditampilkan di transkrip panel (`TranskripPercakapan`), jadi langkah ini memeriksa kalimat itu di sana.
- `I say "..."`: ucapan diketik di kolom ketik panel. Gateway memprosesnya dengan alur yang sama seperti ucapan suara.
- Nomor tiket contoh di SRS (mis. `ADU-0456`) dicocokkan dengan nomor tiket yang benar-benar terbit (`ADU-YYYYMMDD-NNNN`).

Elemen yang disebut skenario dicari lewat atribut `data-name` sesuai Lampiran B, misalnya `PanelPercakapanSuara`, `KartuStatistikLayanan`, `AntreanTiketEskalasi`, dan `FormulirMateri`. Prasyarat yang tersirat di SRS (petugas sudah login, ada tiket di antrean, ada materi yang akan dihapus) ditulis sebagai `Background`. Data uji disiapkan dan dibersihkan di Supabase lokal.
