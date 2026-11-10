// Langkah dashboard tingkat control (ADR 0002) untuk UC Sprint 3. Isian dan pilihan disimpan di world, lalu tombol yang
// ditekan menjalankan aksi control yang sama dengan endpoint atau halaman di belakang tombol itu. Setiap file langkah UC
// mendaftarkan tombolnya di sini memakai label Lampiran B, sehingga kalimat skenario tetap sama dengan SRS.
const aksiTombol = new Map();

/** Mendaftarkan aksi tombol berlabel Lampiran B. `aksi` dijalankan dengan `this` berupa world Cucumber. */
export function tombol(label, aksi) {
  if (aksiTombol.has(label)) throw new Error(`Tombol "${label}" sudah didaftarkan`);
  aksiTombol.set(label, aksi);
}

export function aksiUntuk(label) {
  const aksi = aksiTombol.get(label);
  if (!aksi) throw new Error(`Tombol "${label}" belum punya aksi control`);
  return aksi;
}

/** Tanggal "15-10-2026" seperti di SRS diubah ke nilai <input type="date"> (YYYY-MM-DD) yang dikirim boundary. */
export function nilaiTanggal(teks) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(teks ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : teks;
}

/** Mencari kunci kamus dari labelnya, misalnya "Telaah Dokumen" -> telaah_dokumen. */
export function kunciLabel(kamus, label) {
  const kunci = Object.keys(kamus).find((k) => kamus[k] === label);
  if (!kunci) throw new Error(`Label "${label}" tidak ada di kamus: ${Object.values(kamus).join(', ')}`);
  return kunci;
}
