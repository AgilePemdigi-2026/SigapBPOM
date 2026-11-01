// Data tiruan pemantauan layanan (UC-04) untuk pengembangan lokal, test, dan demo (PROJECT_RULES 4.3).
// Bentuknya mengikuti tabel percakapan, tiket, log_tool, dan view penelepon_tersamar.
import {
  HARI_KATEGORI,
  awalHariWib,
  awalHariWibMundur,
  type JenisInteraksi,
  type JenisTiket,
  type KomponenTersimpan,
  type LogToolTersimpan,
  type PemeriksaKesehatanAgent,
  type PenyimpananPemantauan,
  type StatusTiket,
} from '../PemantauanLayananController.ts';
import type { PengaduanTersimpan, PenyimpananPengaduan } from '../PengaduanController.ts';

export type PercakapanTiruan = {
  id: string;
  noTelp: string | null;
  namaPelapor: string | null;
  waktuMulai: string;
  jenisInteraksi: JenisInteraksi | null;
  status: 'berjalan' | 'selesai_ai' | 'dieskalasi' | 'tiket_terbit' | 'pengaduan_tidak_lengkap';
  tahapAi: string | null;
  topik: string | null;
};

export type TiketTiruan = { noTiket: string; jenis: JenisTiket; percakapanId: string; ringkasan: string | null; status: StatusTiket; tglTerbit: string };

export type DataPemantauan = { percakapan: PercakapanTiruan[]; tiket: TiketTiruan[]; logTool: LogToolTersimpan[] };

const MENIT = 60_000;

/** Contoh data relatif terhadap waktu sekarang, agar statistik "hari ini" selalu terisi saat demo. */
export function contohPemantauan(sekarang = new Date()): DataPemantauan {
  const lalu = (menit: number) => new Date(sekarang.getTime() - menit * MENIT).toISOString();
  const tgl = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(sekarang).replaceAll('-', '');
  const percakapan: PercakapanTiruan[] = [
    { id: 'p-1', noTelp: '0812****7890', namaPelapor: 'B***', waktuMulai: lalu(3), jenisInteraksi: 'informasi_produk', status: 'berjalan', tahapAi: 'memproses', topik: 'Kosmetik' },
    { id: 'p-2', noTelp: '0857****1123', namaPelapor: null, waktuMulai: lalu(1), jenisInteraksi: null, status: 'berjalan', tahapAi: 'mendengar', topik: null },
    { id: 'p-3', noTelp: '0813****4521', namaPelapor: 'S***', waktuMulai: lalu(42), jenisInteraksi: 'pengaduan', status: 'tiket_terbit', tahapAi: null, topik: 'Pangan Olahan' },
    { id: 'p-4', noTelp: '0821****0098', namaPelapor: null, waktuMulai: lalu(95), jenisInteraksi: 'informasi_produk', status: 'dieskalasi', tahapAi: null, topik: 'Obat' },
    { id: 'p-5', noTelp: null, namaPelapor: null, waktuMulai: lalu(130), jenisInteraksi: 'informasi_produk', status: 'selesai_ai', tahapAi: null, topik: 'Suplemen Kesehatan' },
    { id: 'p-6', noTelp: null, namaPelapor: null, waktuMulai: lalu(30 * 60), jenisInteraksi: 'informasi_produk', status: 'selesai_ai', tahapAi: null, topik: 'Kosmetik' },
    { id: 'p-7', noTelp: '0878****3344', namaPelapor: 'R***', waktuMulai: lalu(3 * 24 * 60), jenisInteraksi: 'pengaduan', status: 'tiket_terbit', tahapAi: null, topik: 'Kosmetik' },
  ];
  const tiket: TiketTiruan[] = [
    { noTiket: `ADU-${tgl}-0001`, jenis: 'pengaduan', percakapanId: 'p-3', ringkasan: 'Keracunan setelah makan keripik kemasan tanpa label izin edar', status: 'belum_ditelaah', tglTerbit: lalu(38) },
    { noTiket: `ESK-${tgl}-0001`, jenis: 'eskalasi', percakapanId: 'p-4', ringkasan: 'Pertanyaan keamanan obat batuk untuk ibu hamil', status: 'belum_ditelaah', tglTerbit: lalu(90) },
    { noTiket: 'ADU-20261027-0003', jenis: 'pengaduan', percakapanId: 'p-7', ringkasan: 'Krim pemutih menyebabkan iritasi kulit', status: 'selesai', tglTerbit: lalu(3 * 24 * 60 - 10) },
  ];
  const logTool: LogToolTersimpan[] = [
    { id: 4, namaTool: 'cari_basis_pengetahuan', durasiMs: 640, berhasil: true, waktu: lalu(2) },
    { id: 3, namaTool: 'cek_registrasi_produk', durasiMs: 1820, berhasil: true, waktu: lalu(3) },
    { id: 2, namaTool: 'terbitkan_tiket_eskalasi', durasiMs: 410, berhasil: true, waktu: lalu(90) },
    { id: 1, namaTool: 'cek_registrasi_produk', durasiMs: 5000, berhasil: false, waktu: lalu(94) },
  ];
  return { percakapan, tiket, logTool };
}

export class PenyimpananPemantauanTiruan implements PenyimpananPemantauan, PenyimpananPengaduan {
  data: DataPemantauan;

  constructor(data: DataPemantauan = contohPemantauan()) {
    this.data = data;
  }

  async statistik(sekarang: Date) {
    const hariIni = new Date(awalHariWib(sekarang)).getTime();
    const tujuhHari = new Date(awalHariWibMundur(sekarang, HARI_KATEGORI)).getTime();
    const sejak = (iso: string, t: number) => new Date(iso).getTime() >= t;
    const { percakapan, tiket } = this.data;
    const kategori = new Map<string, number>();
    for (const p of percakapan) if (p.topik && sejak(p.waktuMulai, tujuhHari)) kategori.set(p.topik, (kategori.get(p.topik) ?? 0) + 1);
    return {
      panggilanHariIni: percakapan.filter((p) => sejak(p.waktuMulai, hariIni)).length,
      dijawabAi: percakapan.filter((p) => p.status === 'selesai_ai' && sejak(p.waktuMulai, hariIni)).length,
      tiketEskalasiBaru: tiket.filter((t) => t.jenis === 'eskalasi' && sejak(t.tglTerbit, hariIni)).length,
      tiketBelumDitelaah: tiket.filter((t) => t.status === 'belum_ditelaah').length,
      pengaduanSelesai: tiket.filter((t) => t.jenis === 'pengaduan' && t.status === 'selesai' && sejak(t.tglTerbit, tujuhHari)).length,
      panggilanBerjalan: percakapan.filter((p) => p.status === 'berjalan').length,
      kategori: [...kategori].map(([k, jumlah]) => ({ kategori: k, jumlah })),
    };
  }

  async kasusTindakLanjut(batas: number) {
    return this.data.tiket
      .filter((t) => t.status === 'belum_ditelaah')
      .sort((a, b) => b.tglTerbit.localeCompare(a.tglTerbit))
      .slice(0, batas)
      .map((t) => ({ noTiket: t.noTiket, jenis: t.jenis, ringkasan: t.ringkasan ?? '', tglTerbit: t.tglTerbit }));
  }

  async panggilanAktif() {
    return this.data.percakapan
      .filter((p) => p.status === 'berjalan')
      .sort((a, b) => a.waktuMulai.localeCompare(b.waktuMulai))
      .map((p) => ({ id: p.id, noTelp: p.noTelp, jenisInteraksi: p.jenisInteraksi, topik: p.topik, waktuMulai: p.waktuMulai, tahapAi: p.tahapAi }));
  }

  async logToolTerbaru(batas: number) {
    return [...this.data.logTool].sort((a, b) => b.waktu.localeCompare(a.waktu) || b.id - a.id).slice(0, batas);
  }

  async detail(noTiket: string): Promise<PengaduanTersimpan | null> {
    const t = this.data.tiket.find((x) => x.noTiket === noTiket);
    const p = t && this.data.percakapan.find((x) => x.id === t.percakapanId);
    if (!t || !p) return null;
    return {
      noTiket: t.noTiket,
      jenis: t.jenis,
      status: t.status,
      ringkasan: t.ringkasan,
      tglTerbit: t.tglTerbit,
      percakapanId: p.id,
      waktuMulai: p.waktuMulai,
      jenisInteraksi: p.jenisInteraksi,
      topik: p.topik,
      namaPelapor: p.namaPelapor,
      noTelp: p.noTelp,
    };
  }
}

export class PemeriksaKesehatanTiruan implements PemeriksaKesehatanAgent {
  komponen: KomponenTersimpan[];

  constructor(
    komponen: KomponenTersimpan[] = [
      { nama: 'Voice Gateway', sehat: true, latensiMs: 12 },
      { nama: 'Hermes', sehat: true, latensiMs: 1450 },
      { nama: 'STT/TTS', sehat: true, latensiMs: 380 },
      { nama: 'cekbpom', sehat: false, latensiMs: null },
    ],
  ) {
    this.komponen = komponen;
  }

  async periksa() {
    return this.komponen;
  }
}
