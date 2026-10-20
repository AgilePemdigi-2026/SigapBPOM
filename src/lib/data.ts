// Data dashboard. Sengaja kosong: data tiruan prototipe sudah dihapus, dan isinya
// nanti datang dari Supabase (T-F2.1-03, T-F3.1-03, F5.1). Halaman menampilkan state kosong.

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

export type Tiket = { no: string; ring: string; jenis: 'Pengaduan' | 'Eskalasi AI'; waktu: string; status: string; wait?: string };

export const TIKET: Tiket[] = [];

export const BELUM_DITELAAH = TIKET.filter((t) => t.status === 'Belum Ditelaah');

export const STATISTIK = [
  { label: 'Panggilan Hari Ini', value: '0', sub: 'Belum ada panggilan', subFg: '#4b5260', icon: 'icon-phone-incoming', bg: '#e3ecff', fg: '#2f6bf5' },
  { label: 'Dijawab Otomatis AI', value: '0', sub: 'Belum ada jawaban AI', subFg: '#4b5260', icon: 'icon-bot', bg: '#dcf5e6', fg: '#16a34a' },
  { label: 'Tiket Eskalasi Baru', value: '0', sub: `${BELUM_DITELAAH.length} belum ditelaah`, subFg: '#4b5260', icon: 'icon-ticket', bg: '#fdf0d3', fg: '#b26b00' },
  { label: 'Pengaduan Selesai', value: '0', sub: 'Minggu ini', subFg: '#4b5260', icon: 'icon-circle-check', bg: '#ece7fe', fg: '#6d4aff' },
];

export const KATEGORI: [string, number, string][] = [];

export type Materi = { id: number; judul: string; kategori: string; rujukan: string; tgl: string; aktif: boolean };

export const MATERI: Materi[] = [];

export const KB_TOTAL = { total: MATERI.length, aktif: MATERI.filter((m) => m.aktif).length, nonaktif: MATERI.filter((m) => !m.aktif).length };

export const KATEGORI_MATERI = ['Edukasi Umum', 'Pangan Olahan', 'Kosmetik', 'Obat', 'Obat Tradisional', 'Suplemen Kesehatan', 'Layanan'];

export type Simpul = { id: string; label: string; x: number; y: number; r: number; hub?: boolean; rujukan: string; bagian: string[]; links: number };

export const SIMPUL: Simpul[] = [];

export const SISI: [string, string][] = [];

export const NAV = [
  { href: '/ringkasan', label: 'Ringkasan Layanan', icon: 'icon-layout-grid', badge: '' },
  { href: '/panggilan-berjalan', label: 'Panggilan Berjalan', icon: 'icon-phone-call', badge: '' },
  { href: '/tiket-eskalasi', label: 'Tiket Eskalasi', icon: 'icon-ticket', badge: BELUM_DITELAAH.length ? String(BELUM_DITELAAH.length) : '' },
  { href: '/riwayat-percakapan', label: 'Riwayat Percakapan', icon: 'icon-history', badge: '' },
  { href: '/pengaduan', label: 'Daftar Pengaduan', icon: 'icon-clipboard-list', badge: '' },
  { href: '/basis-pengetahuan', label: 'Basis Pengetahuan', icon: 'icon-book-open', badge: '' },
  { href: '/rekap-laporan', label: 'Rekap & Laporan', icon: 'icon-chart-column', badge: '' },
];
