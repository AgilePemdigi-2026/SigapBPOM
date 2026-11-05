# Backend SIGAP (Supabase)

Pola Boundary, Control, Entity (PROJECT_RULES 4.1):

```
supabase/
├── migrations/                      Entity: tabel, enum, constraint, RLS
└── functions/
    ├── cek-registrasi/              Boundary: tool cek_registrasi_bpom
    ├── cari-pengetahuan/            Boundary: tool cari_basis_pengetahuan (UC-01)
    ├── katalog-materi/              Boundary: katalog materi untuk Voice Gateway (UC-07)
    ├── simpan-materi/               Boundary: simpan dan indeks materi dari dashboard (UC-07)
    ├── terbitkan-tiket-eskalasi/    Boundary: tool terbitkan_tiket_eskalasi
    ├── terbitkan-tiket-pengaduan/   Boundary: tool terbitkan_tiket_pengaduan (UC-02)
    ├── simpan-pengaduan-tidak-lengkap/  Boundary: simpan pengaduan tanpa tiket (UC-02)
    ├── laporkan-panggilan-aktif/    Boundary: laporan panggilan aktif dari Voice Gateway (UC-04)
    ├── catat-percakapan/            Boundary: transkrip, log tool, dan ringkasan dari Voice Gateway (UC-01, UC-05)
    ├── kirim-notifikasi/            Boundary: antrean SMS tindak lanjut tiket yang ditutup (UC-06)
    ├── login/                       Boundary: login dashboard dan penguncian akun (UC-03)
    └── _shared/
        ├── boundary/http.ts         kunci server (x-sigap-kunci), format { status, message, data }
        ├── control/                 InformasiProdukController (UC-01), PengaduanController (UC-02), PenangananController (UC-06) + tes
        ├── entity/                  Produk, nomor telepon, notifikasi
        └── adapter/                 cekbpom (tiruan/resmi), SMS (tiruan), penyimpanan Supabase
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
| `catat-percakapan` | `{ aksi: 'ucapan', percakapanId, pembicara, teks }`, `{ aksi: 'tool', percakapanId, namaTool, durasiMs, berhasil }`, atau `{ aksi: 'ringkasan', percakapanId, ringkasan }` | `{ urutan }` atau `{ tersimpan }`. Pembicara: `sistem`, `penelepon`; urutan dan detik ke- dihitung basis data; nomor telepon di teks disamarkan. Tool: `cek_registrasi_bpom`, `cari_basis_pengetahuan`, tanpa argumen. 404 bila percakapan belum ada, 409 bila sudah berakhir lebih dari 2 menit. Ringkasan (T-F6.3-01): buatan AI setelah panggilan berakhir, paling banyak 500 karakter, tidak menimpa ringkasan yang sudah ada. |
| `kirim-notifikasi` | `{}` | `{ diproses, terkirim, gagal }`. Satu putaran antrean SMS tindak lanjut yang diantrekan `tutup_tiket` lewat `antrekan_notifikasi_tindak_lanjut`. Aman diulang: yang terkirim tidak dikirim lagi, yang gagal dicoba lagi sampai 5 kali. Nomor tujuan dibaca di server dan tidak pernah ada di respons atau log. `SMS_ADAPTER=tiruan` (bawaan) sampai SMS Gateway dipilih. |
| `cari-pengetahuan` | `{ pertanyaan, percakapanId?, ambang?, batas? }` | `{ potongan: [{ teks, judul, rujukanSumber, skor }] }` — 422 bila pertanyaan kosong. Gateway memanggilnya dengan `x-sigap-kunci`, hanya bila `PENGETAHUAN_VEKTOR=1`. |
| `katalog-materi` | `{ offset?, batas? }`, batas paling banyak 1000 | `{ materi: [{ judul, rujukan_sumber, status, isi? }] }` — `isi` hanya untuk materi aktif. Gateway menyinkronkannya berkala dengan `x-sigap-kunci` untuk kutipan CS AI. |
| `simpan-materi` | `{ judul, kategori?, isi?, rujukan }` dengan `Authorization: Bearer <token sesi petugas>`, bukan `x-sigap-kunci` | `MateriPengetahuan` (`id`, `judul`, `kategori`, `rujukan_sumber`, `isi`, `status`, `terindeks`, `diperbarui_oleh`, `diperbarui_pada`) — dipanggil server Astro lewat `/api/simpan-materi`. 400 isian tidak valid, 401 tanpa sesi sah, 403 bukan petugas, 405 selain POST, 422 rujukan sumber kosong, 500 galat sistem. |

Tes control tanpa basis data: `npm test`. Uji lokal penuh (butuh Docker, tanpa akun):
`supabase start`, `supabase db reset`, `supabase functions serve`.

Seed hanya mengisi `materi_pengetahuan`. Setelah `supabase db reset`, isi `materi_potongan` dari korpus `knowledge/`
dengan indeks ulang (materi yang sudah terindeks dilewati, jadi aman diulang):

```bash
eval "$(npx supabase status -o env)"
SUPABASE_URL=$API_URL SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY node scripts/indeks-materi.ts
```

## Checklist deploy ke Supabase Cloud dan VPS

Urutan lengkap membawa `main` ke Supabase Cloud dan VPS. Alasan urutan materi dan login ada di dua bagian berikutnya.

1. Cadangkan basis data cloud (`supabase db dump --linked -f cadangan.sql`, lalu dengan `--data-only` ke berkas lain) dan
   tunjukkan SQL setiap migrasi kepada pemilik proyek sebelum diterapkan.
2. Terapkan migrasi `20261104090000` sampai `20261104090500` sesuai urutan timestamp, satu berkas per transaksi. Migrasi
   `20261030090000_url_sumber_materi.sql` sudah tercatat di Supabase Cloud, jadi tidak diterapkan ulang. Migrasi yang
   diterapkan lewat SQL Editor dicatat dengan `supabase migration repair --status applied <versi>`.
   - `090200` harus sudah di-commit sebelum `090300`: nilai enum baru `terputus` tidak boleh dipakai di transaksi yang
     menambahkannya, jadi keduanya gagal bila ditempel dalam satu eksekusi SQL Editor.
   - Sebelum `090300`, pastikan pg_cron aktif (Database > Extensions) dan catat jumlah tiket ADU yang ringkasannya ditulis
     ulang backfill-nya: `select count(distinct t.id) from public.tiket t join public.pengaduan pg on pg.tiket_id = t.id;`.
     Ringkasan lama hanya bisa dikembalikan dari cadangan langkah 1. Sesudahnya, `select jobname, schedule, active from
     cron.job where jobname = 'tutup-panggilan-yatim';` mengembalikan satu baris `* * * * *` yang aktif.
   - Tanpa `090400`, panel Beban Panggilan di Ringkasan menampilkan "Data panggilan gagal dimuat.". Tanpa `090500`, setiap
     potongan di `cari_potongan` berskor 1, sehingga pencarian pengetahuan tidak berurutan.
3. Pastikan secret cekbpom bernama `CEKBPOM_ADAPTER` (`supabase secrets list`). Fungsi baru tidak lagi membaca ejaan lama
   `CEKBPM_ADAPTER`, dan tanpa `CEKBPOM_ADAPTER=resmi` cekbpom memakai adapter tiruan.
4. Deploy ulang semua fungsi selain `login` (langkah 6), karena semuanya mengimpor kode `_shared` yang berubah, misalnya
   `boundary/http.ts` dan `adapter/cekbpom.ts`:

   ```bash
   supabase functions deploy cek-registrasi cari-pengetahuan katalog-materi simpan-materi terbitkan-tiket-eskalasi \
     terbitkan-tiket-pengaduan simpan-pengaduan-tidak-lengkap laporkan-panggilan-aktif catat-percakapan
   ```
5. Deploy `main` ke VPS (container web dan voice) setelah memastikan environment compose: service voice berisi
   `SUPABASE_URL` dan `SIGAP_KUNCI_INTERNAL` (gateway produksi berhenti saat start tanpa keduanya), service web berisi
   `SIGAP_KUNCI_LOGIN` (langkah 2 bagian login).
6. Deploy fungsi `login` (langkah 3 bagian login).
7. Isi secret `SIGAP_KUNCI_LOGIN` (langkah 4 bagian login). Setelah secret terkonfirmasi di cloud, commit lanjutan menghapus
   `opsional: true` di `functions/login/index.ts` agar fungsi gagal tertutup seperti fungsi lain, lalu `login` dideploy
   ulang.
8. Indeks ulang cloud (langkah 4 bagian urutan potongan), setelah prasyarat `url_sumber`-nya terpenuhi.

## Deploy indeks ulang materi (urutan potongan)

Fungsi `simpan-materi` menulis kolom `materi_potongan.urutan`, dan dashboard membaca potongan berdasarkan kolom itu. Urutan:

1. Terapkan migrasi `20261104090100_indeks_ulang_materi.sql` ke Supabase Cloud. Tanpa kolom `urutan`, dashboard baru
   gagal memuat Graf Pengetahuan dan fungsi `simpan-materi` baru meninggalkan materi baru belum terindeks.
2. Deploy fungsi: `supabase functions deploy simpan-materi`.
3. Deploy dashboard (`main`) ke VPS.
4. Indeks ulang cloud dengan `scripts/indeks-materi.ts` dan kunci service_role cloud, hanya setelah kapasitas basis data
   diperiksa: korpus penuh sekitar 40 ribu potongan vector(1536) beserta indeks HNSW-nya. Isi `url_sumber` materi cloud
   harus sama dengan manifest korpus agar materi senama tidak tertukar. Materi tanpa `url_sumber` memakai dokumen
   manifest yang judul dan rujukannya unik; materi korpus lain yang berkasnya tidak bisa dipastikan dihitung gagal dan
   tetap belum terindeks sampai `url_sumber`-nya diisi.

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
