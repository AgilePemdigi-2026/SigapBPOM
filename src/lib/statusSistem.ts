// Visibility of system status (heuristik Nielsen #1): tombol yang memicu permintaan ke server langsung dinonaktifkan agar
// tidak terkirim dua kali, lalu menampilkan putaran dan teks proses bila permintaan belum selesai setelah TUNDA_MS.
// Penundaan mencegah kedipan untuk proses yang hampir seketika. Dipakai di skrip browser; gaya di styles/global.css.

export const TUNDA_MS = 150;

/** Tandai tombol sedang memproses. Mengembalikan fungsi pemulih yang aman dipanggil lebih dari sekali. */
export function tandaiSibuk(tombol: HTMLButtonElement, teks = 'Memproses…'): () => void {
  const asli = tombol.innerHTML;
  const lebar = tombol.offsetWidth;
  tombol.disabled = true;
  tombol.setAttribute('aria-busy', 'true');
  const jeda = setTimeout(() => {
    // Lebar dipertahankan agar tombol dan tata letak di sekitarnya tidak bergeser.
    if (lebar) tombol.style.minWidth = `${lebar}px`;
    tombol.classList.add('sibuk');
    tombol.innerHTML = `<span class="putar" aria-hidden="true"></span><span>${teks}</span>`;
  }, TUNDA_MS);
  let pulih = false;
  return () => {
    if (pulih) return;
    pulih = true;
    clearTimeout(jeda);
    tombol.classList.remove('sibuk');
    tombol.style.minWidth = '';
    tombol.innerHTML = asli;
    tombol.disabled = false;
    tombol.removeAttribute('aria-busy');
  };
}

/** Ganti teks tombol yang sedang sibuk tanpa memulihkannya, misalnya saat berpindah halaman setelah berhasil. */
export function ubahTeksSibuk(tombol: HTMLButtonElement, teks: string) {
  tombol.classList.add('sibuk');
  tombol.innerHTML = `<span class="putar" aria-hidden="true"></span><span>${teks}</span>`;
}
