# Backend SIGAP (Supabase)

Pola Boundary, Control, Entity (PROJECT_RULES 4.1):

```
supabase/
├── migrations/                      Entity: tabel, enum, constraint, RLS
└── functions/
    ├── cek-registrasi/              Boundary: tool cek_registrasi_bpom
    ├── terbitkan-tiket-eskalasi/    Boundary: tool terbitkan_tiket_eskalasi
    ├── terbitkan-tiket-pengaduan/   Boundary: tool terbitkan_tiket_pengaduan (UC-02)
    ├── simpan-pengaduan-tidak-lengkap/  Boundary: simpan pengaduan tanpa tiket (UC-02)
    ├── laporkan-panggilan-aktif/    Boundary: laporan panggilan aktif dari Voice Gateway (UC-04)
    ├── catat-percakapan/            Boundary: transkrip dan log tool dari Voice Gateway (UC-01)
    ├── login/                       Boundary: login dashboard dan penguncian akun (UC-03)
    └── _shared/
        ├── boundary/http.ts         kunci server (x-sigap-kunci), format { status, message, data }
        ├── control/                 InformasiProdukController (UC-01), PengaduanController (UC-02) + tes
        ├── entity/                  Produk, nomor telepon
        └── adapter/                 cekbpom (tiruan/resmi), penyimpanan Supabase
```

Fungsi tiket dipanggil server ke server oleh Voice Gateway / Hermes Agent dengan header
`x-sigap-kunci: <SIGAP_KUNCI_INTERNAL>`. Fungsi `login` hanya dipanggil server dashboard dengan
`x-sigap-kunci: <SIGAP_KUNCI_LOGIN>`, kunci terpisah agar dashboard tidak bisa memanggil fungsi internal. Tidak ada
fungsi yang dipanggil browser, jadi tidak ada header CORS. Salin `functions/.env.example` ke `functions/.env`.

| Fungsi | Body | `data` |
|---|---|---|
| `cek-registrasi` | `{ namaProduk, percakapanId? }` | `{ hasil: Produk[] }` — kosong berarti tidak ditemukan |
| `terbitkan-tiket-eskalasi` | `{ percakapanId, nomorTelepon, pertanyaan }` | `{ nomorTiket }` — 422 bila nomor tidak valid |
| `terbitkan-tiket-pengaduan` | `{ percakapanId, namaProduk, kronologi, namaPelapor, nomorTelepon, ringkasan? }` | `{ nomorTiket }` ADU — 422 bila data tidak lengkap; retry untuk percakapan yang sama mengembalikan nomor yang sama |
| `simpan-pengaduan-tidak-lengkap` | `{ percakapanId, namaProduk?, kronologi?, namaPelapor?, nomorTelepon? }` | `{ id, status: "pengaduan_tidak_lengkap" }` — tanpa nomor tiket |
| `laporkan-panggilan-aktif` | `{ aksi: 'laporkan', percakapanId, jenisLayanan?, topik?, tahap? }` atau `{ aksi: 'akhiri', percakapanId }` | `{ tersimpan }` atau `{ ditutup }`. Tahap: `mendengar`, `memproses`, `menjawab`. Heartbeat tiap 15 detik; panggilan tanpa heartbeat 60 detik tidak tampil di view `panggilan_berjalan` dan ditutup otomatis. |
| `login` | `{ email, password }` | `{ sesi, petugas }` — 401 membawa pesan kamus UC-03 (isian kosong, kredensial salah, akun terkunci); 503 bila Supabase Auth bermasalah (rate limit, 5xx, jaringan), tanpa menambah penghitung gagal. Email dinormalkan ke huruf kecil. |
| `catat-percakapan` | `{ aksi: 'ucapan', percakapanId, pembicara, teks }` atau `{ aksi: 'tool', percakapanId, namaTool, durasiMs, berhasil }` | `{ urutan }` atau `{ tersimpan }`. Pembicara: `sistem`, `penelepon`; urutan dan detik ke- dihitung basis data; nomor telepon di teks disamarkan. Tool: `cek_registrasi_bpom`, `cari_basis_pengetahuan`, tanpa argumen. 404 bila percakapan belum ada, 409 bila sudah berakhir lebih dari 2 menit. |

Tes control tanpa basis data: `npm test`. Uji lokal penuh (butuh Docker, tanpa akun):
`supabase start`, `supabase db reset`, `supabase functions serve`.

## Deploy fungsi login dengan SIGAP_KUNCI_LOGIN

Fungsi `login` memakai RPC dari migrasi `20261104090000_perketat_login.sql` dan membalas format
`{ status, message, data }`. Dashboard membaca format lama dan baru, dan hanya mengirim kunci bila `SIGAP_KUNCI_LOGIN`
terisi. Fungsi mewajibkan kunci hanya bila secret `SIGAP_KUNCI_LOGIN` terisi (saklar rollout). Urutan:

1. Terapkan migrasi `20261104090000_perketat_login.sql` ke Supabase Cloud. Tanpa RPC-nya, fungsi baru membalas 500.
2. Isi `SIGAP_KUNCI_LOGIN` (string acak panjang) di environment service web pada compose VPS, lalu deploy ulang
   container web. Fungsi lama mengabaikan header kuncinya.
3. Deploy fungsi: `supabase functions deploy login`. Selama secret belum diisi, permintaan tanpa kunci tetap diterima.
4. Nyalakan saklar: `supabase secrets set SIGAP_KUNCI_LOGIN=<nilai yang sama dengan langkah 2>`. Setelah itu
   permintaan tanpa kunci yang benar ditolak 401 "Akses ditolak.".

Langkah 3 tidak boleh mendahului langkah 2, karena dashboard lama hanya membaca `{ sukses, pesan }` dan login gagal
sampai container web diperbarui. Secret diisi paling akhir, karena dashboard tanpa kunci ditolak begitu secret aktif.
