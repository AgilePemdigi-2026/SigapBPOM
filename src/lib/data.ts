// Data dashboard. Data tiruan prototipe sudah dihapus. Statistik ringkasan dibaca lewat PemantauanLayananController (F5.1);
// badge Tiket Eskalasi, pencarian, dan notifikasi dibaca layout dashboard dari antrean_tiket_petugas.

export type Chip = { bg: string; fg: string };

const STATUS: Record<string, [string, string]> = {
  'Belum Ditelaah': ['#fdf0d3', '#8a5300'],
  'Sedang Ditelaah': ['#e3ecff', '#2152c9'],
  'Menunggu Pemeriksaan': ['#ece7fe', '#5b3fc4'],
  'Tanggapan Disusun': ['#daf1f5', '#0e6a80'],
  Selesai: ['#dcf5e6', '#15803d'],
  'Diteruskan ke Instansi Lain': ['#e9ebef', '#475060'],
  Aktif: ['#dcf5e6', '#15803d'],
  'Tidak Aktif': ['#e9ebef', '#475060'],
};

export function chip(status: string): Chip {
  const [bg, fg] = STATUS[status] ?? ['#e9ebef', '#475060'];
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
