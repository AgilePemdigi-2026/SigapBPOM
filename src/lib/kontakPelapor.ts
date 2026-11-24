// Tindak lanjut lewat WhatsApp manual (ADR 0006): petugas menghubungi pelapor dari halaman detail tiket memakai tautan
// wa.me dan tel:, tanpa SMS Gateway dan tanpa API WhatsApp. Dipakai server (detail.astro) dan skrip klien yang sama.

/** Kontak pelapor dari RPC ambil_kontak_pelapor. Nomor lengkap hanya untuk halaman detail tiket (PROJECT_RULES 5.5, ADR 0006). */
export type KontakPelapor = { noTelp: string | null; sudahDihubungi: boolean; dihubungiPada: string | null };

export type JenisTiketKontak = 'pengaduan' | 'eskalasi';

/** `081234567890` atau `+62 812-3456-7890` menjadi `6281234567890`; null bila bukan nomor ponsel Indonesia. */
export function nomorInternasional(noTelp: string | null | undefined): string | null {
  const digit = (noTelp ?? '').replace(/\D/g, '');
  const n = digit.startsWith('0') ? `62${digit.slice(1)}` : digit;
  return /^628\d{7,11}$/.test(n) ? n : null;
}

/** `6281234567890` ditampilkan `0812-3456-7890`. Nomor tidak sah ditampilkan apa adanya. */
export function tampilNomor(noTelp: string | null | undefined): string {
  const n = nomorInternasional(noTelp);
  if (!n) return noTelp?.trim() || '—';
  const lokal = `0${n.slice(2)}`;
  return `${lokal.slice(0, 4)}-${lokal.slice(4, 8)}-${lokal.slice(8)}`;
}

export function tautanWhatsApp(noTelp: string | null | undefined, teks: string): string | null {
  const n = nomorInternasional(noTelp);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(teks)}` : null;
}

export function tautanTelepon(noTelp: string | null | undefined): string | null {
  const n = nomorInternasional(noTelp);
  return n ? `tel:+${n}` : null;
}

/**
 * Isi awal pesan WhatsApp. Pengaduan yang sudah ditutup membawa tanggapan resmi utuh (REQ-6.6); selain itu hanya
 * pembuka dengan nomor tiket, dan petugas mengetik sisanya (klarifikasi pengaduan, atau jawaban tiket eskalasi).
 */
export function teksWhatsApp(o: { jenis: JenisTiketKontak; noTiket: string; selesai: boolean; tanggapan?: string | null; petugas?: string | null }): string {
  const tanggapan = o.tanggapan?.trim();
  // Nama petugas yang masuk memperkenalkan diri, supaya pesan dari nomor pribadi tidak dikira penipuan.
  const salam = o.petugas?.trim() ? `Halo, saya ${o.petugas.trim()} dari HaloBPOM` : 'Halo, kami dari HaloBPOM';
  if (o.jenis === 'pengaduan' && o.selesai && tanggapan) {
    return `${salam}. Pengaduan Anda dengan nomor tiket ${o.noTiket} telah selesai ditindaklanjuti.\n\n`
      + `Tanggapan resmi:\n${tanggapan}\n\nTerima kasih telah menghubungi HaloBPOM.`;
  }
  return o.jenis === 'eskalasi'
    ? `${salam}, menindaklanjuti pertanyaan Anda dengan nomor tiket ${o.noTiket}.\n\n`
    : `${salam}, terkait pengaduan Anda dengan nomor tiket ${o.noTiket}.\n\n`;
}
