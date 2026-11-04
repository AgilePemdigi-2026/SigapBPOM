// Boundary UC-01/UC-02: kartu di transkrip panel suara. Menghasilkan HTML karena transkrip dirender di browser.
// Teks pesan mengikuti kamus pesan PRD-rinci Lampiran A.

export type StatusIzin = 'Berlaku' | 'Tidak Berlaku' | 'Dibatalkan';

/** Bentuk sama dengan entity `Produk` di supabase/functions/_shared/entity/produk.ts. */
export type Produk = { nama: string; nomorIzinEdar: string; status: StatusIzin; pendaftar: string; sumber: string };

/** Hasil cek registrasi yang ditampilkan: satu produk, beberapa kandidat dengan jumlah seluruh hasil (BR-7), atau tidak ditemukan. */
export type HasilProduk =
  | { jenis: 'tunggal'; produk: Produk }
  | { jenis: 'kandidat'; produk: Produk[]; total?: number }
  | { jenis: 'tidak_ditemukan' };

/** REQ-1.5, BR-7: kandidat yang disebutkan paling banyak tiga. */
export const KANDIDAT_MAKS = 3;
/** Kamus pesan Lampiran A (UC-01 "Produk tidak ditemukan"). */
export const PESAN_TIDAK_DITEMUKAN = 'Produk tidak ditemukan pada data registrasi BPOM. Tekan 2 untuk menyampaikan pengaduan.';

export const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// Status tidak hanya dibedakan dengan warna: ikon dan teks status selalu tampil.
const IKON_STATUS: Record<StatusIzin, string> = { Berlaku: 'icon-circle-check', 'Tidak Berlaku': 'icon-circle-x', Dibatalkan: 'icon-ban' };
const KELAS_STATUS: Record<StatusIzin, string> = { Berlaku: 'ok', 'Tidak Berlaku': 'no', Dibatalkan: 'no' };

/** Lencana status izin edar, dipakai kartu transkrip dan tabel panel Cari Produk. */
export const htmlStatus = (s: StatusIzin) =>
  `<span class="k-status ${KELAS_STATUS[s] ?? 'no'}"><i class="${IKON_STATUS[s] ?? 'icon-circle-x'}" aria-hidden="true"></i>${esc(s)}</span>`;

function barisProduk(p: Produk) {
  return `<div class="k-produk-nama">${esc(p.nama)}</div>
    <dl>
      <dt>Nomor izin edar</dt><dd>${esc(p.nomorIzinEdar)}</dd>
      <dt>Status</dt><dd>${htmlStatus(p.status)}</dd>
      <dt>Pendaftar</dt><dd>${esc(p.pendaftar)}</dd>
    </dl>`;
}

/**
 * Kartu hasil cek produk (T-F1.2-01). Kartu tidak ditemukan memuat tombol 2 ke pengaduan (UC-01 Alternative Path 3) dengan
 * label tombol menu 2 di panel (SRS Panel Percakapan Suara).
 */
export function htmlKartuProduk(h: HasilProduk): string {
  if (h.jenis === 'tidak_ditemukan') {
    return `<section class="k-produk kosong" aria-label="Hasil cek produk"><i class="icon-search-x" aria-hidden="true"></i><p>${PESAN_TIDAK_DITEMUKAN}</p>
    <button type="button" data-pick="2" aria-label="2: Pengaduan Produk"><span class="no purple" aria-hidden="true">2</span><span class="t">Pengaduan Produk</span></button></section>`;
  }
  if (h.jenis === 'tunggal') {
    return `<section class="k-produk" aria-label="Hasil cek produk">${barisProduk(h.produk)}<p class="k-sumber">Sumber: ${esc(h.produk.sumber)}</p></section>`;
  }
  const tampil = h.produk.slice(0, KANDIDAT_MAKS);
  const n = h.total ?? h.produk.length;
  return `<section class="k-produk" aria-label="Kandidat produk">
    <p class="k-judul">${n} hasil ditemukan${n > tampil.length ? `, ${tampil.length} teratas` : ''}. Sebutkan nomor pilihan Anda.</p>
    <ol>${tampil.map((p) => `<li>${barisProduk(p)}</li>`).join('')}</ol>
    <p class="k-sumber">Sumber: ${esc(tampil[0]?.sumber ?? '')}</p>
  </section>`;
}

/** Kamus pesan Lampiran A (UC-01 "Tiket eskalasi terbit"). */
export const pesanTiketEskalasi = (nomorTiket: string) => `Nomor tiket Anda ${nomorTiket}. Jawaban petugas akan dikirim melalui SMS.`;

/** Kartu eskalasi (T-F1.4-01). Selain warna kuning, teks menyatakan jawaban datang dari petugas, bukan AI. */
export function htmlKartuEskalasi(nomorTiket: string): string {
  return `<section class="k-eskalasi" aria-label="Diteruskan ke petugas">
    <div class="k-eskalasi-judul"><i class="icon-user-round-check" aria-hidden="true"></i>Diteruskan ke petugas BPOM</div>
    <p>Jawaban untuk pertanyaan ini akan diberikan oleh petugas, bukan oleh AI.</p>
    <dl><dt>Nomor tiket</dt><dd>${esc(nomorTiket)}</dd></dl>
    <p class="k-sumber">Jawaban petugas akan dikirim melalui SMS.</p>
  </section>`;
}

/** Kamus pesan Lampiran A (UC-02 "Tiket pengaduan terbit"). */
export const pesanTiketPengaduan = (nomorTiket: string) =>
  `Pengaduan Anda telah dicatat dengan nomor tiket ${nomorTiket}. Tindak lanjut akan dikirim melalui SMS.`;

/** Kamus pesan Lampiran A (UC-02 "Panggilan putus, data kurang"). */
export const PESAN_PENGADUAN_TIDAK_LENGKAP = 'Panggilan berakhir. Pengaduan belum lengkap sehingga nomor tiket tidak diterbitkan.';

/** Kartu tiket pengaduan (T-F4.1-03, T-F4.2-02, REQ-2.3, REQ-2.4). Teks diambil dari potongan pesan kamus Lampiran A dan label "Nomor tiket". */
export function htmlKartuPengaduan(nomorTiket: string): string {
  return `<section class="k-pengaduan" aria-label="Tiket pengaduan">
    <div class="k-pengaduan-judul"><i class="icon-clipboard-check" aria-hidden="true"></i>Pengaduan Anda telah dicatat</div>
    <dl><dt>Nomor tiket</dt><dd>${esc(nomorTiket)}</dd></dl>
    <p class="k-sumber">Tindak lanjut akan dikirim melalui SMS.</p>
  </section>`;
}

/** Kartu tiket untuk satu event jawaban (T-F4.2-03, REQ-2.4). Gateway mengirim nomor ADU di `pengaduan`; transkrip tiruan juga di `tiket`. */
export function htmlKartuTiket(e: { tiket?: string; pengaduan?: string | null }): string {
  if (e.tiket) return e.tiket.startsWith('ADU-') ? htmlKartuPengaduan(e.tiket) : htmlKartuEskalasi(e.tiket);
  return e.pengaduan ? htmlKartuPengaduan(e.pengaduan) : '';
}

/** Pesan akhir panggilan selain pengaduan tidak lengkap. */
export const PESAN_PANGGILAN_BERAKHIR = 'Panggilan berakhir. Transkrip tersimpan di register layanan.';

/** Kamus pesan Lampiran A (UC-01, UC-02 "Gateway suara gagal atau jaringan putus"). */
export const PESAN_GANGGUAN_SUARA = 'Layanan suara sedang gangguan. Silakan coba lagi.';

/** Galat yang pesannya berasal dari balasan Voice Gateway. */
export class GalatGateway extends Error {}

// Galat gateway yang terdaftar di kamus Lampiran A (UC-01, UC-02) dan boleh ditampilkan apa adanya. Pesan API internal
// ("Akses ditolak.", "Permintaan tidak valid.") dan galat browser (jaringan putus, JSON rusak) tidak (PROJECT_RULES 4.4 dan 5.12).
const PESAN_GALAT_TERDAFTAR: readonly string[] = [
  'Suara tidak terdengar. Silakan ulangi.',
  'Rekaman terlalu panjang.',
  'Terlalu banyak permintaan. Coba lagi sebentar lagi.',
  'Layanan sedang penuh. Coba lagi sebentar lagi.',
  'Percakapan ini tidak dapat dilanjutkan. Silakan mulai panggilan baru.',
  'Layanan AI sudah mencapai batas pemakaian hari ini. Silakan coba lagi besok.',
  'Batas percakapan untuk panggilan ini sudah tercapai. Silakan akhiri dan mulai panggilan baru.',
  'Batas penerbitan tiket hari ini sudah tercapai. Silakan coba lagi besok.',
];

export const pesanGalatPanggilan = (e: unknown) =>
  e instanceof GalatGateway && PESAN_GALAT_TERDAFTAR.includes(e.message) ? e.message : PESAN_GANGGUAN_SUARA;

/**
 * Status akhir panggilan di panel (T-F4.3-03, REQ-2.5). Layanan pengaduan yang belum bertiket memakai pesan kamus
 * "Panggilan putus, data kurang"; balasan /voice/akhiri, bila memuat pesan, menggantikannya.
 */
export function pesanAkhirPanggilan(a: { layanan: 1 | 2 | null; tiketPengaduan: boolean; akhir?: { pesan?: unknown } | null }): string {
  if (typeof a.akhir?.pesan === 'string') return a.akhir.pesan;
  return a.layanan === 2 && !a.tiketPengaduan ? PESAN_PENGADUAN_TIDAK_LENGKAP : PESAN_PANGGILAN_BERAKHIR;
}
