// Data tiruan untuk kartu di panel suara selama tool cekbpom (#28) dan penerbitan tiket belum tersambung. Hanya dipakai mode demo di dev server.
import type { HasilProduk, Produk } from '../kartuPanggilan.ts';

export const PRODUK_TIRUAN: Produk[] = [
  { nama: 'Susu Formula Sehat', nomorIzinEdar: 'BPOM RI MD 865009001234', status: 'Berlaku', pendaftar: 'PT Nutrisi Sehat Indonesia', sumber: 'Data tiruan cekbpom' },
  { nama: 'Paracetamol 500 mg Tablet', nomorIzinEdar: 'DBL1234567810A1', status: 'Berlaku', pendaftar: 'PT Farma Nusantara', sumber: 'Data tiruan cekbpom' },
  { nama: 'Paracetamol Sirup Anak', nomorIzinEdar: 'DBL1234567837A1', status: 'Berlaku', pendaftar: 'PT Farma Nusantara', sumber: 'Data tiruan cekbpom' },
  { nama: 'Paracetamol Kaplet Forte', nomorIzinEdar: 'DBL1234567904A1', status: 'Tidak Berlaku', pendaftar: 'PT Medika Prima', sumber: 'Data tiruan cekbpom' },
];

export type GiliranTiruan = { ucapan: string; jawaban: string; produk?: HasilProduk; tiket?: string };

/** Transkrip tiruan per jalur, dibuka lewat `?demo=<nama>` di dev server. */
export const TRANSKRIP_TIRUAN: Record<string, GiliranTiruan[]> = {
  'produk-tunggal': [{
    ucapan: 'Susu Formula Sehat sudah terdaftar di BPOM belum?',
    jawaban: 'Susu Formula Sehat terdaftar dengan nomor izin edar BPOM RI MD 865009001234, status izin Berlaku.',
    produk: { jenis: 'tunggal', produk: PRODUK_TIRUAN[0] },
  }],
  'produk-kandidat': [{
    ucapan: 'Paracetamol terdaftar tidak?',
    jawaban: 'Ada 3 produk paracetamol yang cocok. Sebutkan nomor pilihan Anda.',
    produk: { jenis: 'kandidat', produk: PRODUK_TIRUAN.slice(1) },
  }],
  'produk-tidak-ditemukan': [{
    ucapan: 'Krim Glowing Ajaib terdaftar di BPOM?',
    jawaban: 'Produk tidak ditemukan pada data registrasi BPOM. Tekan 2 untuk menyampaikan pengaduan.',
    produk: { jenis: 'tidak_ditemukan' },
  }],
  eskalasi: [
    { ucapan: 'Apakah obat batuk ini aman untuk ibu hamil?', jawaban: 'Pertanyaan Anda akan diteruskan kepada petugas. Mohon sebutkan nomor telepon Anda.' },
    { ucapan: 'Nol delapan satu dua tiga empat lima enam tujuh delapan sembilan nol.', jawaban: 'Nomor tiket Anda ESK-20261019-0001. Jawaban petugas akan dikirim melalui SMS.', tiket: 'ESK-20261019-0001' },
  ],
};
