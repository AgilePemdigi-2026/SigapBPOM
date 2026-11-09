# ADR 0004: Caddy sebagai Reverse Proxy

Status: Diusulkan, 4 November 2026. Menunggu persetujuan PO dan dosen karena menyimpang dari SRS 3.4.2.

## Konteks

SRS 3.4.2 menetapkan "Nginx sebagai reverse proxy untuk HTTPS dan WSS", dan PRD menyalinnya. VPS demo sudah berjalan dengan Caddy, dan kode sudah bergantung pada perilaku Caddy (`voice-gateway/server.mjs` dan `src/lib/pembatasLaju.ts` membaca alamat klien dari `X-Forwarded-For`). Keputusan ini belum pernah dicatat.

## Keputusan

- Reverse proxy di VPS adalah Caddy, dijalankan lewat Docker Compose bersama service `web` (Astro, adapter Node) dan `voice` (Voice Gateway). Hermes Agent berjalan di host VPS, bukan di container.
- Caddy memasang sertifikat HTTPS otomatis dan menerima TLS 1.2 atau lebih baru (NFR-15, SRS 3.4.2).
- `/voice/*` diteruskan ke `voice:8090`, selebihnya ke `web`. Dashboard memanggil gateway dari sisi server lewat `VOICE_GATEWAY_URL=http://voice:8090`.

Rincian di atas berasal dari catatan VPS 3 November 2026 dan belum dicek ulang terhadap Caddyfile. Caddyfile dan `docker-compose.yml` saat ini hanya ada di VPS. Salinan tanpa rahasia sebaiknya dimasukkan ke repo oleh pengelola VPS lewat PR terpisah.

## Alternatif

- Nginx, sesuai SRS 3.4.2: setara secara fungsi, tetapi sertifikat TLS harus diurus terpisah (misalnya certbot) dan VPS harus dikonfigurasi ulang.

## Konsekuensi

- `reverse_proxy` Caddy menambahkan alamat klien sebagai entri terakhir `X-Forwarded-For`. Astro dan Voice Gateway hanya memakai entri terakhir, karena entri sebelumnya bisa dipalsukan klien. Syaratnya, port Astro dan gateway tidak dipublikasikan ke luar Docker.
- Respons NDJSON `POST /voice/giliran` harus mengalir tanpa buffer. `reverse_proxy` Caddy langsung meneruskan respons tanpa `Content-Length` seperti ini. Bila Caddyfile diubah, misalnya dengan kompresi atau `flush_interval`, perilaku ini harus tetap terjaga.
- WSS tidak melewati Caddy. Transkrip live tersambung langsung dari browser ke ElevenLabs (ADR 0003).
- `docs/prd/features.json` dan prompt task di `docs/prd/tasks.json` masih menyebut Nginx dan diselaraskan terpisah.
- SRS 3.4.2 juga meminta server berada di Indonesia. Lokasi VPS demo dan Supabase belum memenuhi syarat ini (issue #30, ADR 0001).
