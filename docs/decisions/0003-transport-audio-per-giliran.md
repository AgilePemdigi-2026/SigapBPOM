# ADR 0003: Transport Audio per Giliran

Status: Diusulkan, 4 November 2026. Menunggu persetujuan PO dan dosen karena menyimpang dari SRS 3.4.1 dan 3.4.3.

## Konteks

SRS 3.4.1 meminta komunikasi audio real-time lewat WebRTC atau WSS secara full-duplex, dan SRS 3.4.3 menyebut audio dialirkan dalam format Opus melalui WebRTC. PRD-rinci Bagian 10 mencerminkan teks itu (Voice Gateway WebRTC/WSS, codec Opus).

Voice Gateway yang dibangun sejak Sprint 1 bekerja per giliran: satu ucapan penelepon menjadi satu permintaan HTTP, dan jawabannya dialirkan kembali dalam permintaan yang sama. Batas laju, kuota AI dan TTS, alur pengaduan, eskalasi, serta pencatatan transkrip berjalan di gateway untuk setiap giliran. Keputusan ini belum pernah dicatat.

## Keputusan

1. **STT realtime.** Selama mendengarkan, panel meminta token sekali pakai lewat `POST /voice/stt-realtime`, lalu membuka WSS langsung ke ElevenLabs (`wss://api.elevenlabs.io/v1/speech-to-text/realtime`). Audio dikirim sebagai PCM 16 kHz dari AudioWorklet `public/worklet/pcm16.js`, dengan model `scribe_v2_realtime` dan VAD yang menutup ucapan setelah jeda 0,8 detik (`voice-gateway/sttRealtime.mjs`). Kunci API tetap di server dan audio tidak melewati gateway.
2. **Fallback rekam lalu unggah.** Bila `STT_REALTIME=0`, token gagal, koneksi WSS gagal, atau browser tidak punya AudioWorklet, panel merekam satu ucapan dengan MediaRecorder (`audio/webm;codecs=opus`, `audio/mp4`, atau `audio/ogg;codecs=opus`) lalu mengunggahnya ke `POST /voice/giliran`. Gateway mentranskripsikannya dengan model `ELEVENLABS_STT_MODEL`. Panel juga kembali ke jalur ini setelah penelepon diam 30 detik, agar sesi realtime tidak terus ditagih.
3. **Giliran teks.** Teks final dari STT realtime dikirim sebagai giliran teks (`POST /voice/giliran` dengan JSON `{ id, teks }`). Respons berupa NDJSON: transkrip lebih dulu, lalu kalimat demi kalimat beserta alamat suaranya, terakhir baris `selesai`.
4. **Suara jawaban.** TTS ElevenLabs berupa MP3 44,1 kHz 64 kbps. Kalimat jawaban diambil dari `GET /voice/suara/:token` (token berlaku 2 menit), dan pesan tetap dari `GET /voice/statis/:nama` yang dirender sekali lalu disimpan di memori.
5. **Half-duplex.** Mikrofon tidak merekam selama agen berbicara. Panel kembali mendengarkan setelah audio jawaban selesai diputar.

Kontrak tiap rute ada di [docs/api.md](../api.md).

## Alternatif

- WSS full-duplex lewat gateway: audio mikrofon dan suara jawaban dalam satu koneksi selama panggilan. Gateway harus memegang koneksi panjang, menangani barge-in, dan menerapkan kuota serta transkrip di tengah aliran. Belum dibangun.
- WebRTC dengan Opus, sesuai SRS 3.4.3: butuh server signaling dan TURN tambahan di VPS. Belum dibangun.

## Konsekuensi

- Tidak ada barge-in: penelepon menunggu agen selesai bicara sebelum bisa menyela.
- Keluaran suara MP3, bukan Opus. Masukan Opus hanya ada di jalur fallback bila browser mendukung `audio/webm;codecs=opus`; STT realtime memakai PCM 16 kHz.
- NFR-1 diukur per giliran, dari ucapan ditetapkan sampai kalimat pertama mulai diputar.
- STT realtime ditagih per detik audio. Gateway membatasi token 30 per 5 menit per IP, dan panel menutup sesi setelah penelepon diam lama.
- Panel tersambung langsung ke `wss://api.elevenlabs.io`. Repo belum memasang Content Security Policy; bila reverse proxy memasangnya, `connect-src` harus memuat alamat itu.
- STT realtime masuk lewat commit `8ed7758` (3 November 2026), yang belum ada di versi `main` yang tercatat berjalan di VPS. Sampai VPS diperbarui, di sana hanya berjalan jalur rekam lalu unggah.
- PRD-rinci Bagian 10 tetap memuat teks SRS sampai PO dan dosen menyetujui penyimpangan ini. README, PRD, dan spec F1 sudah menggambarkan transport yang dibangun.
