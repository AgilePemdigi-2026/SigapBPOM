# Korpus Peraturan BPOM (RAG SIGAP)

Basis pengetahuan untuk jawaban edukasi UC-01 (F1.3). Voice Gateway memuat seluruh berkas `.md` di folder ini saat mulai, memotongnya per pasal, lalu mencari potongan yang relevan dengan BM25 (`voice-gateway/pengetahuan.mjs`). Kutipan teratas dikirim ke Hermes sebagai data rujukan agar jawaban menyebut nomor dan tahun peraturan.

- Sumber: repo `harezadmm/CoretaxAgent` (`knowledge/regulations`), aslinya dari peraturan.bpk.go.id.
- Isi: hanya peraturan BPOM yang masih berlaku dan relevan untuk masyarakat. Peraturan administrasi internal dan peraturan pencabutan tidak disertakan.
- Daftar dokumen beserta tautan sumbernya ada di `manifest.json`.

Menambah dokumen: simpan markdown dengan frontmatter `title`, `nomor`, `tahun`, `bentuk_singkat`, `source_url`, lalu mulai ulang Voice Gateway. Lokasi folder dapat diganti lewat env `KORPUS_DIR`.
