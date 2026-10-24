declare namespace App {
  interface Locals {
    autentikasi: import('./lib/AutentikasiController').AutentikasiController;
    /** Diisi middleware untuk setiap route dashboard; tidak ada di route publik. */
    petugas?: import('./lib/AutentikasiController').Petugas;
  }
}
