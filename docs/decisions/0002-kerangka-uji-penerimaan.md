# ADR 0002: Kerangka Uji Penerimaan Gherkin

Status: Diusulkan, 31 Oktober 2026. Menyelesaikan PRD Bagian 15 butir 9 dan PROJECT_RULES 6.1 lapisan Penerimaan.

## Konteks

PROJECT_RULES 6.1 mewajibkan skenario Gherkin per UC dijalankan otomatis. SRS menyebut Behat, tetapi ADR 0001 memilih stack TypeScript dan Node, sehingga Behat (PHP) tidak cocok. Sampai sekarang repo belum punya kerangka uji penerimaan.

## Keputusan

- Kerangka: Cucumber.js (`@cucumber/cucumber`), berjalan di Node yang sama dengan `npm test` dan tanpa build tambahan.
- Skenario ditulis dalam bahasa Indonesia (`# language: id`: `Fitur`, `Latar Belakang`, `Skenario`, `Diketahui`, `Ketika`, `Maka`, `Dan`) di `features/uc-XX-*.feature`. Langkahnya ada di `features/step_definitions/*.mjs`.
- Langkah memanggil lapisan control langsung, dengan adapter eksternal diganti versi tiruan, sehingga uji bawaan (`npm run test:bdd`) cepat dan tidak bergantung pada jaringan.
- Skenario bertag `@live` memanggil layanan luar yang asli, misalnya scraping cekbpom.pom.go.id. Skenario ini hanya jalan lewat `npm run test:bdd:live`, untuk memastikan struktur situs sumber belum berubah.

## Alternatif

- Playwright dengan playwright-bdd: cocok untuk skenario yang menyentuh UI dashboard. Bisa ditambahkan nanti untuk UC dashboard dengan berkas `.feature` yang sama.
- Hanya `node:test` dengan nama test berkode REQ: tidak memenuhi syarat skenario Gherkin yang bisa dibaca pemangku kepentingan.

## Konsekuensi

- Menambah satu dev dependency.
- Skenario UC lain menyusul per sprint mengikuti kriteria penerimaan PRD-rinci.
- Skenario `@live` bisa gagal karena gangguan situs luar, jadi tidak dijadikan syarat CI.
