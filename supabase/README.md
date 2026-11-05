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
    ├── kirim-notifikasi/            Boundary: antrean SMS tindak lanjut tiket yang ditutup (UC-06)
    └── _shared/
        ├── boundary/http.ts         kunci internal, format { status, message, data }
        ├── control/                 InformasiProdukController (UC-01), PengaduanController (UC-02), PenangananController (UC-06) + tes
        ├── entity/                  Produk, nomor telepon, notifikasi
        └── adapter/                 cekbpom (tiruan/resmi), SMS (tiruan), penyimpanan Supabase
```

Fungsi tiket dipanggil server ke server oleh Voice Gateway / Hermes Agent dengan header
`x-sigap-kunci: <SIGAP_KUNCI_INTERNAL>`. Salin `functions/.env.example` ke `functions/.env`.

| Fungsi | Body | `data` |
|---|---|---|
| `cek-registrasi` | `{ namaProduk, percakapanId? }` | `{ hasil: Produk[] }` — kosong berarti tidak ditemukan |
| `terbitkan-tiket-eskalasi` | `{ percakapanId, nomorTelepon, pertanyaan }` | `{ nomorTiket }` — 422 bila nomor tidak valid |
| `terbitkan-tiket-pengaduan` | `{ percakapanId, namaProduk, kronologi, namaPelapor, nomorTelepon, ringkasan? }` | `{ nomorTiket }` ADU — 422 bila data tidak lengkap; retry untuk percakapan yang sama mengembalikan nomor yang sama |
| `simpan-pengaduan-tidak-lengkap` | `{ percakapanId, namaProduk?, kronologi?, namaPelapor?, nomorTelepon? }` | `{ id, status: "pengaduan_tidak_lengkap" }` — tanpa nomor tiket |
| `laporkan-panggilan-aktif` | `{ aksi: 'laporkan', percakapanId, jenisLayanan?, topik?, tahap? }` atau `{ aksi: 'akhiri', percakapanId }` | `{ tersimpan }` atau `{ ditutup }`. Tahap: `mendengar`, `memproses`, `menjawab`. Heartbeat tiap 15 detik; panggilan tanpa heartbeat 60 detik tidak tampil di view `panggilan_berjalan` dan ditutup otomatis. |
| `catat-percakapan` | `{ aksi: 'ucapan', percakapanId, pembicara, teks }` atau `{ aksi: 'tool', percakapanId, namaTool, durasiMs, berhasil }` | `{ urutan }` atau `{ tersimpan }`. Pembicara: `sistem`, `penelepon`; urutan dan detik ke- dihitung basis data; nomor telepon di teks disamarkan. Tool: `cek_registrasi_bpom`, `cari_basis_pengetahuan`, tanpa argumen. 404 bila percakapan belum ada, 409 bila sudah berakhir lebih dari 2 menit. |
| `kirim-notifikasi` | `{}` | `{ diproses, terkirim, gagal }`. Satu putaran antrean SMS tindak lanjut yang diantrekan `tutup_tiket` lewat `antrekan_notifikasi_tindak_lanjut`. Aman diulang: yang terkirim tidak dikirim lagi, yang gagal dicoba lagi sampai 5 kali. Nomor tujuan dibaca di server dan tidak pernah ada di respons atau log. `SMS_ADAPTER=tiruan` (bawaan) sampai SMS Gateway dipilih. |

Tes control tanpa basis data: `npm test`. Uji lokal penuh (butuh Docker, tanpa akun):
`supabase start`, `supabase db reset`, `supabase functions serve`.
