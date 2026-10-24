// Boundary UC-01: kartu di transkrip panel suara. Menghasilkan HTML karena transkrip dirender di browser.
// Teks pesan mengikuti kamus pesan PRD-rinci Lampiran A.

export type StatusIzin = 'Berlaku' | 'Tidak Berlaku' | 'Dibatalkan';

/** Bentuk sama dengan entity `Produk` di supabase/functions/_shared/entity/produk.ts. */
export type Produk = { nama: string; nomorIzinEdar: string; status: StatusIzin; pendaftar: string; sumber: string };

/** Hasil cek registrasi yang ditampilkan: satu produk, beberapa kandidat (BR-7), atau tidak ditemukan. */
export type HasilProduk =
  | { jenis: 'tunggal'; produk: Produk }
  | { jenis: 'kandidat'; produk: Produk[] }
  | { jenis: 'tidak_ditemukan' };

/** REQ-1.5, BR-7: kandidat yang disebutkan paling banyak tiga. */
export const KANDIDAT_MAKS = 3;
/** Kamus pesan Lampiran A (UC-01 "Produk tidak ditemukan"). */
export const PESAN_TIDAK_DITEMUKAN = 'Produk tidak ditemukan pada data registrasi BPOM. Tekan 2 untuk menyampaikan pengaduan.';

export const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// Status tidak hanya dibedakan dengan warna: ikon dan teks status selalu tampil.
const IKON_STATUS: Record<StatusIzin, string> = { Berlaku: 'icon-circle-check', 'Tidak Berlaku': 'icon-circle-x', Dibatalkan: 'icon-ban' };
const KELAS_STATUS: Record<StatusIzin, string> = { Berlaku: 'ok', 'Tidak Berlaku': 'no', Dibatalkan: 'no' };

function barisProduk(p: Produk) {
  return `<div class="k-produk-nama">${esc(p.nama)}</div>
    <dl>
      <dt>Nomor izin edar</dt><dd>${esc(p.nomorIzinEdar)}</dd>
      <dt>Status</dt><dd><span class="k-status ${KELAS_STATUS[p.status]}"><i class="${IKON_STATUS[p.status]}" aria-hidden="true"></i>${esc(p.status)}</span></dd>
      <dt>Pendaftar</dt><dd>${esc(p.pendaftar)}</dd>
    </dl>`;
}

/** Kartu hasil cek produk (T-F1.2-01). */
export function htmlKartuProduk(h: HasilProduk): string {
  if (h.jenis === 'tidak_ditemukan') {
    return `<section class="k-produk kosong" aria-label="Hasil cek produk"><i class="icon-search-x" aria-hidden="true"></i><p>${PESAN_TIDAK_DITEMUKAN}</p></section>`;
  }
  if (h.jenis === 'tunggal') {
    return `<section class="k-produk" aria-label="Hasil cek produk">${barisProduk(h.produk)}<p class="k-sumber">Sumber: ${esc(h.produk.sumber)}</p></section>`;
  }
  const tampil = h.produk.slice(0, KANDIDAT_MAKS);
  return `<section class="k-produk" aria-label="Kandidat produk">
    <p class="k-judul">${h.produk.length} hasil ditemukan${h.produk.length > KANDIDAT_MAKS ? `, ${KANDIDAT_MAKS} teratas` : ''}. Sebutkan nomor pilihan Anda.</p>
    <ol>${tampil.map((p) => `<li>${barisProduk(p)}</li>`).join('')}</ol>
    <p class="k-sumber">Sumber: ${esc(tampil[0]?.sumber ?? '')}</p>
  </section>`;
}
