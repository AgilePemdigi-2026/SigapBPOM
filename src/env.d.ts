declare namespace App {
  interface Locals {
    autentikasi: import('./lib/AutentikasiController').AutentikasiController;
    /** Diisi middleware untuk setiap route dashboard; tidak ada di route publik. */
    petugas?: import('./lib/AutentikasiController').Petugas;
    /** Token akses Supabase petugas yang sedang masuk. Hanya di server, tidak pernah dikirim ke browser. Kosong pada sesi tiruan. */
    tokenAkses?: string;
  }
}
