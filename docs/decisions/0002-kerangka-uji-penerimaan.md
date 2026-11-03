# ADR 0002: Kerangka Uji Penerimaan Gherkin

Status: Diusulkan, 31 Oktober 2026 (diperbarui 3 November 2026). Menyelesaikan PRD Bagian 15 butir 9 dan PROJECT_RULES 6.1 lapisan Penerimaan.

## Konteks

PROJECT_RULES 6.1 mewajibkan skenario Gherkin per UC dijalankan otomatis. SRS menyebut Behat, tetapi ADR 0001 memilih stack TypeScript dan Node, sehingga Behat (PHP) tidak cocok. Sampai sekarang repo belum punya kerangka uji penerimaan.

## Keputusan

- Kerangka: Cucumber.js (`@cucumber/cucumber`), berjalan di Node yang sama dengan `npm test` dan tanpa build tambahan.
- Skenario ditulis dalam bahasa Indonesia (`# language: id`: `Fitur`, `Latar Belakang`, `Skenario`, `Diketahui`, `Ketika`, `Maka`, `Dan`) di `features/uc-XX-*.feature`. Langkahnya ada di `features/step_definitions/*.mjs`.
- Langkah memanggil lapisan control langsung, dengan adapter eksternal diganti versi tiruan, sehingga uji bawaan (`npm run test:bdd`) cepat dan tidak bergantung pada jaringan.
- Skenario bertag `@live` memanggil layanan luar yang asli, misalnya scraping cekbpom.pom.go.id. Skenario ini hanya jalan lewat `npm run test:bdd:live`, untuk memastikan struktur situs sumber belum berubah.

## Alternatif

- playwright-bdd (runner Playwright Test): tidak dipilih untuk skenario UI agar semua skenario tetap memakai satu runner, Cucumber.js. Playwright dipakai sebagai pustaka browser di langkah `@ui` (lihat Pembaruan).
- Hanya `node:test` dengan nama test berkode REQ: tidak memenuhi syarat skenario Gherkin yang bisa dibaca pemangku kepentingan.

## Konsekuensi

- Menambah satu dev dependency.
- Skenario UC lain menyusul per sprint mengikuti kriteria penerimaan PRD-rinci.
- Skenario `@live` bisa gagal karena gangguan situs luar, jadi tidak dijadikan syarat CI.

## Pembaruan 3 November 2026: skenario UI

- Skenario SRS Lampiran F ditambahkan dengan tag `@ui` (`features/uc-XX-*.ui.feature`) dan dijalankan lewat browser terhadap aplikasi yang sedang berjalan, setara Behat dengan Mink, dengan `npm run test:bdd:ui`.
- Skenario `@ui` memakai teks SRS apa adanya (bahasa Inggris, gaya langkah Mink) agar bisa ditelusuri langsung ke Tabel B.2 sampai B.9. Skenario control tetap berbahasa Indonesia.
- Browser dijalankan dengan pustaka `playwright`. Elemen dicari lewat atribut `data-name` sesuai Lampiran B.
- Skenario `@ui` tidak ikut `npm run test:bdd` karena butuh Supabase lokal, Edge Functions, Voice Gateway, dan dev server. Cara menjalankannya ada di `features/README.md`.
