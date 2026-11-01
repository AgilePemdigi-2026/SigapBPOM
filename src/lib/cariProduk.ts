// Boundary UC-01 (REQ-1.3): panel Cari Produk di halaman publik. Saat penelepon menanyakan produk, CS AI terlihat
// mengetik kueri lalu tabel hasil cekbpom muncul, berisi data yang sama dengan yang dibacakan AI.
import { esc, htmlStatus, type StatusIzin } from './kartuPanggilan.ts';

/** Baris `cek` dari Voice Gateway (voice-gateway/cekbpom.mjs `tabelCek`). */
export type BarisCek = { nama: string; merek: string; nomorIzinEdar: string; status: StatusIzin; pendaftar: string };
export type TabelCek = { kueri: string; total: number; dibaca: number; galat: boolean; baris: BarisCek[] };

/** Detail event `sigap:cari-produk` dari panel suara ke halaman publik. */
export type PeristiwaCari =
  | { tahap: 'layanan'; layanan: 1 | 2 | null }
  | { tahap: 'cari'; kueri: string }
  | { tahap: 'hasil'; tabel: TabelCek }
  | { tahap: 'tutup' };

export const NAMA_PERISTIWA = 'sigap:cari-produk';
export const SUMBER_CEK = 'cekbpom.pom.go.id';

const angka = (n: number) => new Intl.NumberFormat('id-ID').format(n);

/** Kalimat ringkas di atas tabel. Status gagal dan tidak ditemukan dinyatakan dengan teks, tidak hanya warna. */
export function ringkasanCek(t: TabelCek): { jenis: 'ok' | 'kosong' | 'galat'; teks: string } {
  if (t.galat) return { jenis: 'galat', teks: 'Pengecekan data registrasi sedang gangguan. Coba lagi atau cek langsung di cekbpom.pom.go.id.' };
  if (!t.baris.length) return { jenis: 'kosong', teks: `Tidak ada produk yang cocok dengan “${t.kueri}”.` };
  const tampil = t.total > t.baris.length ? `, menampilkan ${t.baris.length} teratas` : '';
  return { jenis: 'ok', teks: `${angka(t.total)} produk ditemukan${tampil}.` };
}

/** Baris tabel hasil. Baris yang dibacakan AI (BR-7, paling banyak tiga) diberi tanda. */
export function htmlBarisCek(t: TabelCek): string {
  return t.baris.map((b, i) => {
    const dibaca = i < t.dibaca;
    const merek = b.merek && b.merek.toLowerCase() !== b.nama.toLowerCase() ? `<span class="cp-merek">Merek: ${esc(b.merek)}</span>` : '';
    return `<tr class="${dibaca ? 'dibaca' : ''}" style="--i:${i}">
      <td><div class="cp-nie"><span>${esc(b.nomorIzinEdar)}</span>${dibaca ? '<span class="cp-dibaca"><i class="icon-volume-2" aria-hidden="true"></i>Dibacakan</span>' : ''}</div></td>
      <td><div class="cp-nama"><span>${esc(b.nama)}</span>${merek}</div></td>
      <td class="cp-daftar">${esc(b.pendaftar)}</td>
      <td>${htmlStatus(b.status)}</td>
    </tr>`;
  }).join('');
}
