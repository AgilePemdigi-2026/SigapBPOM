# Backend SIGAP (Supabase)

Pola Boundary, Control, Entity (PROJECT_RULES 4.1):

```
supabase/
├── migrations/                      Entity: tabel, enum, constraint, RLS
└── functions/
    ├── cek-registrasi/              Boundary: tool cek_registrasi_bpom
    ├── terbitkan-tiket-eskalasi/    Boundary: tool terbitkan_tiket_eskalasi
    ├── laporkan-panggilan-aktif/    Boundary: laporan panggilan aktif dari Voice Gateway (UC-04)
    └── _shared/
        ├── boundary/http.ts         kunci internal, format { status, message, data }
        ├── control/                 InformasiProdukController (UC-01) + tes
        ├── entity/                  Produk, nomor telepon
        └── adapter/                 cekbpom (tiruan/resmi), penyimpanan Supabase
```

Kedua fungsi dipanggil server ke server oleh Voice Gateway / Hermes Agent dengan header
`x-sigap-kunci: <SIGAP_KUNCI_INTERNAL>`. Salin `functions/.env.example` ke `functions/.env`.

| Fungsi | Body | `data` |
|---|---|---|
| `cek-registrasi` | `{ namaProduk, percakapanId? }` | `{ hasil: Produk[] }` — kosong berarti tidak ditemukan |
| `terbitkan-tiket-eskalasi` | `{ percakapanId, nomorTelepon, pertanyaan }` | `{ nomorTiket }` — 422 bila nomor tidak valid |
| `laporkan-panggilan-aktif` | `{ aksi: 'laporkan', percakapanId, jenisLayanan?, topik?, tahap? }` atau `{ aksi: 'akhiri', percakapanId }` | `{ tersimpan }` atau `{ ditutup }`. Tahap: `mendengar`, `memproses`, `menjawab`. Heartbeat tiap 15 detik; panggilan tanpa heartbeat 60 detik tidak tampil di view `panggilan_berjalan` dan ditutup otomatis. |

Tes control tanpa basis data: `npm test`. Uji lokal penuh (butuh Docker, tanpa akun):
`supabase start`, `supabase db reset`, `supabase functions serve`.
