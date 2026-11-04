// Data tiruan riwayat percakapan (UC-05) untuk pengembangan lokal dan demo (PROJECT_RULES 4.3), dipakai hanya bila
// tidak ada token sesi Supabase. Bentuknya mengikuti view riwayat_percakapan (T-F6.1-01).
import type { PenyimpananRiwayat, PercakapanTersimpan, Periode, RingkasanPeriode } from '../TranskripController.ts';

const MENIT = 60_000;

/** Contoh data relatif terhadap waktu sekarang, agar periode bulan berjalan selalu terisi saat demo. */
export function contohRiwayat(sekarang = new Date()): PercakapanTersimpan[] {
  const lalu = (menit: number) => new Date(sekarang.getTime() - menit * MENIT).toISOString();
  const tgl = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(sekarang).replaceAll('-', '');
  const baris: [number, string | null, string | null, string, string | null, string | null][] = [
    [3, 'informasi_produk', 'Cek izin edar Susu Formula Sehat, status Berlaku', 'selesai_ai', null, null],
    [52, 'informasi_produk', 'Pertanyaan keamanan obat batuk untuk ibu hamil', 'dieskalasi', `ESK-${tgl}-0002`, '0821****0098'],
    [88, 'pengaduan', 'Krim Wajah Glowing, iritasi kulit setelah dua hari pemakaian', 'tiket_terbit', `ADU-${tgl}-0003`, '0812****7890'],
    [130, 'informasi_produk', 'Pencarian Minyak Telon Plus gagal: sumber registrasi tidak dapat diakses', 'dieskalasi', `ESK-${tgl}-0001`, '0857****1123'],
    [155, 'pengaduan', 'Panggilan berakhir sebelum data pengaduan lengkap; nomor tiket tidak diterbitkan', 'pengaduan_tidak_lengkap', null, null],
    [170, 'informasi_produk', 'Syarat izin edar suplemen kesehatan dijawab dengan rujukan Peraturan BPOM', 'selesai_ai', null, null],
    // Penelepon menutup panggilan sebelum memilih layanan.
    [240, null, null, 'selesai_ai', null, null],
    [310, 'pengaduan', 'Jamu pegal linu diduga mengandung bahan kimia obat', 'tiket_terbit', `ADU-${tgl}-0002`, '0813****4521'],
    [420, 'informasi_produk', 'Status izin edar Paracetamol Sirup Anak, Berlaku', 'selesai_ai', null, null],
    [600, 'informasi_produk', 'Cara membaca kode izin edar pangan olahan', 'selesai_ai', null, null],
    [780, 'pengaduan', 'Keripik kemasan tanpa label izin edar menyebabkan mual', 'tiket_terbit', `ADU-${tgl}-0001`, '0878****3344'],
    [900, 'informasi_produk', 'Kosmetik impor tanpa nomor notifikasi', 'selesai_ai', null, null],
  ];
  return baris.map(([menit, jenisInteraksi, ringkasan, statusPenyelesaian, noTiket, noTelpTersamar], i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    waktuMulai: lalu(menit),
    jenisInteraksi,
    ringkasan,
    statusPenyelesaian,
    noTiket,
    noTelpTersamar,
  }));
}

export class PenyimpananRiwayatTiruan implements PenyimpananRiwayat {
  data: PercakapanTersimpan[];

  constructor(data: PercakapanTersimpan[] = contohRiwayat()) {
    this.data = data;
  }

  dalam({ dari, sampai }: Periode) {
    return this.data
      .filter((p) => p.statusPenyelesaian !== 'berjalan' && p.waktuMulai >= dari && p.waktuMulai < sampai)
      .sort((a, b) => b.waktuMulai.localeCompare(a.waktuMulai) || b.id.localeCompare(a.id));
  }

  async daftar({ periode, offset, batas }: { periode: Periode; offset: number; batas: number }) {
    return this.dalam(periode).slice(offset, offset + batas);
  }

  async ringkasan(periode: Periode): Promise<RingkasanPeriode> {
    const p = this.dalam(periode);
    return {
      total: p.length,
      informasiProduk: p.filter((x) => x.jenisInteraksi === 'informasi_produk').length,
      pengaduanProduk: p.filter((x) => x.jenisInteraksi === 'pengaduan').length,
      dieskalasi: p.filter((x) => x.statusPenyelesaian === 'dieskalasi').length,
    };
  }
}
