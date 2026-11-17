// Data dashboard. Data tiruan prototipe sudah dihapus. Statistik ringkasan dibaca lewat PemantauanLayananController (F5.1);
// badge Tiket Eskalasi, pencarian, dan notifikasi dibaca layout dashboard dari antrean_tiket_petugas.

export type Chip = { bg: string; fg: string };

// Warna chip memakai token tema (global.css) agar terbaca di tema terang dan gelap.
const t = (warna: string): [string, string] => [`var(--t-${warna}-bg)`, `var(--t-${warna}-fg)`];

const STATUS: Record<string, [string, string]> = {
  'Belum Ditelaah': t('amber'),
  'Sedang Ditelaah': t('blue'),
  'Menunggu Pemeriksaan': t('violet'),
  'Tanggapan Disusun': t('teal'),
  Selesai: t('green'),
  'Diteruskan ke Instansi Lain': t('gray'),
  // Riwayat Percakapan (UC-05): warna Badge mockup Figma 09 · Riwayat Percakapan.
  'Informasi Produk': t('blue'),
  Pengaduan: t('violet'),
  'selesai oleh AI': t('green'),
  dieskalasi: t('amber'),
  'tiket terbit': t('violet'),
  'pengaduan tidak lengkap': t('gray'),
  terputus: t('red'),
  Aktif: t('green'),
  'Tidak Aktif': t('gray'),
};

export function chip(status: string): Chip {
  const [bg, fg] = STATUS[status] ?? t('gray');
  return { bg, fg };
}

export const KATEGORI_MATERI = ['Edukasi Umum', 'Pangan Olahan', 'Kosmetik', 'Obat', 'Obat Tradisional', 'Suplemen Kesehatan', 'Layanan'];

export const NAV = [
  { href: '/ringkasan', label: 'Ringkasan Layanan', icon: 'icon-layout-grid' },
  { href: '/panggilan-berjalan', label: 'Panggilan Berjalan', icon: 'icon-phone-call' },
  { href: '/tiket-eskalasi', label: 'Tiket Eskalasi', icon: 'icon-ticket' },
  { href: '/riwayat-percakapan', label: 'Riwayat Percakapan', icon: 'icon-history' },
  { href: '/pengaduan', label: 'Daftar Pengaduan', icon: 'icon-clipboard-list' },
  { href: '/basis-pengetahuan', label: 'Basis Pengetahuan', icon: 'icon-book-open' },
  { href: '/rekap-laporan', label: 'Rekap & Laporan', icon: 'icon-chart-column' },
  { href: '/pantau-ai-agent', label: 'Pantau AI Agent', icon: 'icon-bot' },
];
