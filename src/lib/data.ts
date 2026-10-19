// Data tiruan dashboard, diambil dari prototipe Claude Design "SIGAP Prototype".
// Diganti query Supabase saat task backend Sprint 1 dikerjakan (T-F2.1-03, T-F3.1-03).

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

export const TIKET: Tiket[] = [
  { no: 'ADU-0456', ring: 'Krim Wajah Glowing — iritasi kulit setelah dua hari pemakaian', jenis: 'Pengaduan', waktu: '08 Okt · 09:12', status: 'Belum Ditelaah', wait: '1 jam 30 mnt' },
  { no: 'ESK-0123', ring: 'Pertanyaan keamanan obat batuk untuk ibu hamil', jenis: 'Eskalasi AI', waktu: '08 Okt · 09:48', status: 'Belum Ditelaah', wait: '54 mnt menunggu' },
  { no: 'ESK-0122', ring: 'Data registrasi tidak dapat diakses saat pencarian "Minyak Telon Plus"', jenis: 'Eskalasi AI', waktu: '08 Okt · 08:30', status: 'Belum Ditelaah', wait: '2 jam 12 mnt' },
  { no: 'ADU-0455', ring: 'Jamu pegal linu "Cap Akar Dewa" diduga mengandung bahan kimia obat', jenis: 'Pengaduan', waktu: '07 Okt · 21:05', status: 'Belum Ditelaah', wait: '13 jam' },
  { no: 'ADU-0454', ring: 'Minuman serbuk jahe merah, kemasan menggembung sebelum kedaluwarsa', jenis: 'Pengaduan', waktu: '07 Okt · 16:40', status: 'Sedang Ditelaah' },
  { no: 'ESK-0121', ring: 'Tidak ada rujukan KB: aturan impor suplemen untuk pemakaian pribadi', jenis: 'Eskalasi AI', waktu: '07 Okt · 14:22', status: 'Sedang Ditelaah' },
  { no: 'ADU-0453', ring: 'Kopi stamina "Kuat Jaya" klaim menyembuhkan, dijual daring', jenis: 'Pengaduan', waktu: '07 Okt · 11:15', status: 'Menunggu Pemeriksaan' },
];

export const BELUM_DITELAAH = TIKET.filter((t) => t.status === 'Belum Ditelaah');

// Linimasa panggilan: detik sejak 00:00 WIB. Jendela 10:14–10:54, kolom per 2 menit.
export const TL_START = 36840;
export const TL_SPAN = 2400;
export const TL_NOW = 38520;

export type TlKind = 'green' | 'purple' | 'amber' | 'live';
export type TlRow = { no: string; jenis: 'Informasi Produk' | 'Pengaduan'; s: number; e: number | null; k: TlKind; label: string; chip: string; tilt?: boolean };

export const TIMELINE: TlRow[] = [
  { no: '0813****2210', jenis: 'Informasi Produk', s: 36860, e: 37400, k: 'green', label: 'Susu Formula Sehat', chip: 'Selesai oleh AI' },
  { no: '0819****4471', jenis: 'Pengaduan', s: 37000, e: 37720, k: 'purple', label: 'Masker wajah "Bening Ayu"', chip: 'ADU-0457' },
  { no: '0812****7890', jenis: 'Informasi Produk', s: 37480, e: 38020, k: 'amber', label: 'Dosis obat anak', chip: 'ESK-0124' },
  { no: '0878****5521', jenis: 'Informasi Produk', s: 37980, e: null, k: 'live', label: 'Mencari data registrasi', chip: 'LIVE', tilt: true },
  { no: '0821****0043', jenis: 'Pengaduan', s: 38220, e: null, k: 'live', label: 'Mengumpulkan data', chip: 'LIVE' },
  { no: '0896****3377', jenis: 'Informasi Produk', s: 38430, e: null, k: 'live', label: 'Menu layanan', chip: 'LIVE' },
];

export const STATISTIK = [
  { label: 'Panggilan Hari Ini', value: '128', sub: '+12% dibanding kemarin', subFg: '#15803d', icon: 'icon-phone-incoming', bg: '#e3ecff', fg: '#2f6bf5' },
  { label: 'Dijawab Otomatis AI', value: '119', sub: '93% dari total panggilan', subFg: '#15803d', icon: 'icon-bot', bg: '#dcf5e6', fg: '#16a34a' },
  { label: 'Tiket Eskalasi Baru', value: '9', sub: `${BELUM_DITELAAH.length} belum ditelaah`, subFg: '#8a5300', icon: 'icon-ticket', bg: '#fdf0d3', fg: '#b26b00' },
  { label: 'Pengaduan Selesai', value: '14', sub: 'Minggu ini', subFg: '#4b5260', icon: 'icon-circle-check', bg: '#ece7fe', fg: '#6d4aff' },
];

export const KASUS_URUTAN = ['ESK-0123', 'ADU-0456', 'ESK-0122', 'ADU-0455'];

export const KATEGORI: [string, number, string][] = [
  ['Legalitas produk pangan', 38, 'linear-gradient(90deg,#5b8dff,#2a62f0)'],
  ['Kosmetik & notifikasi', 24, 'linear-gradient(90deg,#3ad07f,#1fbe62)'],
  ['Obat & suplemen', 19, 'linear-gradient(90deg,#ffdc6e,#f5b70f)'],
  ['Prosedur pengaduan', 11, 'linear-gradient(90deg,#a77bff,#7b4dff)'],
  ['Di luar cakupan', 8, 'linear-gradient(90deg,#b8bec8,#9aa1ad)'],
];

export type Materi = { id: number; judul: string; kategori: string; rujukan: string; tgl: string; aktif: boolean };

export const MATERI: Materi[] = [
  { id: 1, judul: 'Cara membaca nomor izin edar pada kemasan', kategori: 'Edukasi Umum', rujukan: 'KataBPOM — Kenali Nomor Izin Edar', tgl: '07 Okt 2026', aktif: true },
  { id: 2, judul: 'Bahan berbahaya pada kosmetik: merkuri dan hidrokuinon', kategori: 'Kosmetik', rujukan: 'Public Warning BPOM, 1 Okt 2026', tgl: '02 Okt 2026', aktif: true },
  { id: 3, judul: 'Ketentuan label pangan olahan', kategori: 'Pangan Olahan', rujukan: 'Peraturan BPOM tentang Label Pangan Olahan', tgl: '30 Sep 2026', aktif: true },
  { id: 4, judul: 'Obat tradisional dengan bahan kimia obat', kategori: 'Obat Tradisional', rujukan: 'KataBPOM — Waspada Jamu BKO', tgl: '28 Sep 2026', aktif: true },
  { id: 5, judul: 'Prosedur pengaduan konsumen HaloBPOM', kategori: 'Layanan', rujukan: 'SOP Layanan HaloBPOM', tgl: '20 Sep 2026', aktif: true },
  { id: 6, judul: 'Batas klaim pada suplemen kesehatan', kategori: 'Suplemen Kesehatan', rujukan: 'Pedoman Klaim Suplemen Kesehatan BPOM', tgl: '12 Sep 2026', aktif: true },
  { id: 7, judul: 'Daftar produk kosmetik ditarik 2023', kategori: 'Kosmetik', rujukan: 'Siaran Pers BPOM 2023', tgl: '14 Mar 2024', aktif: false },
];

// Total di indeks lebih besar dari daftar contoh di atas, seperti di prototipe.
export const KB_TOTAL = { total: 1284, aktif: 1271, nonaktif: 13 };

export const KATEGORI_MATERI = ['Edukasi Umum', 'Pangan Olahan', 'Kosmetik', 'Obat', 'Obat Tradisional', 'Suplemen Kesehatan', 'Layanan'];

export type Simpul = { id: string; label: string; x: number; y: number; r: number; hub?: boolean; rujukan: string; bagian: string[]; links: number };

export const SIMPUL: Simpul[] = [
  { id: 'nie', label: 'Nomor Izin Edar', x: 50, y: 48, r: 62, hub: true, rujukan: 'KataBPOM — Kenali Nomor Izin Edar', bagian: ['§1 Format kode MD, ML, TR, SD, NA', '§2 Cara cek di cekbpom.pom.go.id', '§3 Masa berlaku izin edar'], links: 6 },
  { id: 'label', label: 'Label Pangan Olahan', x: 22, y: 22, r: 44, rujukan: 'Peraturan BPOM tentang Label Pangan Olahan', bagian: ['§4 Informasi wajib pada label', '§7 Tanggal kedaluwarsa'], links: 2 },
  { id: 'merkuri', label: 'Kosmetik Bermerkuri', x: 78, y: 20, r: 46, rujukan: 'Public Warning BPOM, 1 Okt 2026', bagian: ['§1 Daftar produk', '§2 Efek merkuri pada kulit'], links: 3 },
  { id: 'bko', label: 'Jamu BKO', x: 84, y: 66, r: 40, rujukan: 'KataBPOM — Waspada Jamu BKO', bagian: ['§1 Ciri obat tradisional ber-BKO', '§3 Cara melapor'], links: 2 },
  { id: 'suplemen', label: 'Klaim Suplemen', x: 58, y: 86, r: 40, rujukan: 'Pedoman Klaim Suplemen Kesehatan BPOM', bagian: ['§2 Klaim yang diizinkan', '§5 Klaim terlarang'], links: 2 },
  { id: 'aduan', label: 'Prosedur Pengaduan', x: 24, y: 76, r: 44, rujukan: 'SOP Layanan HaloBPOM', bagian: ['§1 Data wajib pengaduan', '§2 Alur tindak lanjut', '§4 Notifikasi SMS'], links: 3 },
  { id: 'kedaluwarsa', label: 'Kedaluwarsa', x: 8, y: 48, r: 32, rujukan: 'Peraturan BPOM tentang Label Pangan Olahan', bagian: ['§7 Tanggal kedaluwarsa'], links: 2 },
];

export const SISI: [string, string][] = [['nie', 'label'], ['nie', 'merkuri'], ['nie', 'bko'], ['nie', 'suplemen'], ['nie', 'aduan'], ['label', 'kedaluwarsa'], ['aduan', 'kedaluwarsa'], ['merkuri', 'aduan'], ['bko', 'suplemen']];

export const NAV = [
  { href: '/ringkasan', label: 'Ringkasan Layanan', icon: 'icon-layout-grid', badge: '' },
  { href: '/panggilan-berjalan', label: 'Panggilan Berjalan', icon: 'icon-phone-call', badge: '3' },
  { href: '/tiket-eskalasi', label: 'Tiket Eskalasi', icon: 'icon-ticket', badge: String(BELUM_DITELAAH.length) },
  { href: '/riwayat-percakapan', label: 'Riwayat Percakapan', icon: 'icon-history', badge: '' },
  { href: '/pengaduan', label: 'Daftar Pengaduan', icon: 'icon-clipboard-list', badge: '' },
  { href: '/basis-pengetahuan', label: 'Basis Pengetahuan', icon: 'icon-book-open', badge: '' },
  { href: '/rekap-laporan', label: 'Rekap & Laporan', icon: 'icon-chart-column', badge: '' },
];
