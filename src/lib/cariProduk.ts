// Boundary UC-01 (REQ-1.3): panel Cari Produk di halaman publik. Saat penelepon menanyakan produk, CS AI terlihat
// mengetik kueri lalu tabel hasil cekbpom muncul, berisi data yang sama dengan yang dibacakan AI.
import { esc, htmlStatus, type StatusIzin } from './kartuPanggilan.ts';

/** Baris `cek` dari Voice Gateway (voice-gateway/cekbpom.mjs `tabelCek`). */
export type BarisCek = {
  nama: string; merek: string; nomorIzinEdar: string; status: StatusIzin; pendaftar: string;
  // Bidang modal Detail Produk; tidak ada bila gateway lama.
  berlakuSampai?: string; kategori?: string; terbit?: string; komposisi?: string; kemasan?: string; alamatPendaftar?: string; diterbitkanOleh?: string;
};
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
      <td><div class="cp-nama"><button type="button" class="cp-buka" data-detail="${i}" aria-haspopup="dialog" aria-label="Lihat detail ${esc(b.nama)}">${esc(b.nama)}</button>${merek}</div></td>
      <td class="cp-daftar">${esc(b.pendaftar)}</td>
      <td>${htmlStatus(b.status)}</td>
    </tr>`;
  }).join('');
}

export const URL_CEKBPOM = 'https://cekbpom.pom.go.id/all-produk';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
/** `2026-09-24` menjadi `24 September 2026`; nilai lain ditampilkan apa adanya, kosong menjadi tanda hubung. */
export function tanggalId(t?: string): string {
  const v = String(t ?? '').trim();
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return v || '-';
  return `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}`;
}

const ada = (t?: string) => (t && t.trim() ? t : '-');

/** Isi modal Detail Produk (judul, merek, nomor registrasi, dan bidang seperti di cekbpom). Semua teks di-escape. */
export function htmlDetailProduk(b: BarisCek): string {
  const bidang = (label: string, isi: string, lebar = false) =>
    `<div class="dp-f${lebar ? ' lebar' : ''}"><dt>${esc(label)}</dt><dd>${esc(isi)}</dd></div>`;
  const pendaftar = `<div class="dp-f lebar"><dt>Pendaftar</dt><dd>${esc(ada(b.pendaftar))}${b.alamatPendaftar ? `<span class="dp-sub">${esc(b.alamatPendaftar)}</span>` : ''}</dd></div>`;
  return `<div class="dp-kepala">
    <div class="dp-baris">${b.kategori ? `<span class="dp-lencana">${esc(b.kategori)}</span>` : ''}${htmlStatus(b.status)}</div>
    <p class="dp-nama">${esc(b.nama)}</p>
    ${b.merek && b.merek.toLowerCase() !== b.nama.toLowerCase() ? `<p class="dp-merek">${esc(b.merek)}</p>` : ''}
    <p class="dp-nie">${esc(b.nomorIzinEdar)}</p>
  </div>
  <dl class="dp-grid">
    ${bidang('Tanggal Terbit', tanggalId(b.terbit))}
    ${bidang('Masa Berlaku s/d', tanggalId(b.berlakuSampai))}
    ${bidang('Komposisi', ada(b.komposisi), true)}
    ${pendaftar}
    ${bidang('Kemasan', ada(b.kemasan), true)}
    ${bidang('Diterbitkan Oleh', ada(b.diterbitkanOleh), true)}
  </dl>`;
}
