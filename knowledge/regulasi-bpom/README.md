# Korpus Peraturan BPOM (RAG SIGAP)

Basis pengetahuan untuk jawaban edukasi UC-01 (F1.3). Voice Gateway memuat seluruh berkas `.md` di folder ini saat mulai, memotongnya per pasal, lalu mencari potongan yang relevan dengan BM25 (`voice-gateway/pengetahuan.mjs`). Kutipan teratas dikirim ke Hermes sebagai data rujukan agar jawaban menyebut nomor dan tahun peraturan.

- Sumber: repo `harezadmm/CoretaxAgent` (`knowledge/regulations`), aslinya dari peraturan.bpk.go.id.
- Isi: hanya peraturan BPOM yang masih berlaku dan relevan untuk masyarakat. Peraturan administrasi internal dan peraturan pencabutan tidak disertakan.
- Tambahan 3 November 2026 dari JDIH BPOM (jdih.pom.go.id): PerBPOM 11/2026 Kemasan Pangan, PerBPOM 12/2026 Penarikan dan Pemusnahan Obat, dan Kepka 265/2026 Nilai Kandungan Zat Gizi untuk UMK. Lampiran berupa tabel tidak disertakan.
- Kolom `kategori` di manifest, bila ada, dipakai sebagai kategori materi di dashboard.
- Daftar dokumen beserta tautan sumbernya ada di `manifest.json`.

Menambah dokumen: simpan markdown dengan frontmatter `title`, `nomor`, `tahun`, `bentuk_singkat`, `source_url`, lalu mulai ulang Voice Gateway. Lokasi folder dapat diganti lewat env `KORPUS_DIR`.
