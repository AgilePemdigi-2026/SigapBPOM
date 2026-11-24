// Teks panel Provider AI (REQ-4.5, T-F5.5-06) yang dipakai render server dan skrip browser, agar baris "Terakhir diubah"
// sama sebelum dan sesudah petugas menyimpan.

/** Konfirmasi saat memilih Lokal ketika komponen AI Lokal berstatus Gangguan (spec 5.5). */
export const KONFIRMASI_LOKAL_MATI = 'Perangkat AI lokal sedang tidak aktif. Selama mode Lokal dipakai, panggilan akan diteruskan ke petugas. Lanjutkan?';

/** Waktu WIB dengan format yang sama seperti waktu tiket di dashboard, misalnya "24 Nov 2026 14:05 WIB". */
export const waktuPengaturan = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(iso))
    .replace(/\./g, ':')
    .replace(',', '')
    .concat(' WIB');

/** Isi baris "Terakhir diubah": nama pengubah bila terbaca, lalu waktunya. */
export const teksTerakhirDiubah = (diubahOleh: string | null, diubahPada: string) =>
  diubahOleh ? `${diubahOleh}, ${waktuPengaturan(diubahPada)}` : waktuPengaturan(diubahPada);
