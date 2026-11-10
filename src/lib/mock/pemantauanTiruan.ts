// Data tiruan pemantauan layanan (UC-04) untuk pengembangan lokal, test, dan demo (PROJECT_RULES 4.3).
// Bentuknya mengikuti tabel percakapan, tiket, pengaduan, log_tool, dan view penelepon_tersamar; hitungannya
// mengikuti RPC ambil_ringkasan_layanan dan ambil_detail_pengaduan_tiket serta view antrean_tiket_petugas dan
// beban_panggilan_per_jam.
import type {
  BebanPerJam,
  DataRingkasanLayanan,
  DetailKasusPengaduan,
  KasusPerluTindakLanjut,
  KomponenTersimpan,
  LogToolTersimpan,
  PanggilanAktif,
  PemeriksaKesehatanAgent,
  PenyimpananPemantauan,
  StatistikLayanan,
  StatusTiket,
  TiketAntrean,
} from '../PemantauanLayananController.ts';

export type PercakapanTiruan = {
  id: string;
  noTelp: string | null;
  namaPelapor: string | null;
  waktuMulai: string;
  jenisInteraksi: 'informasi_produk' | 'pengaduan' | null;
  status: 'berjalan' | 'selesai_ai' | 'dieskalasi' | 'tiket_terbit' | 'pengaduan_tidak_lengkap';
  tahapAi: string | null;
  topik: string | null;
};

export type TiketTiruan = {
  id: string;
  noTiket: string;
  jenis: KasusPerluTindakLanjut['jenis'];
  percakapanId: string;
  ringkasan: string;
  status: StatusTiket;
  tglTerbit: string;
  /** Berkas pengaduan, hanya untuk tiket pengaduan. */
  pengaduan?: { namaProduk: string; kronologi: string; kelengkapan: boolean; tglPengaduan: string };
};

export type DataPemantauan = { percakapan: PercakapanTiruan[]; tiket: TiketTiruan[]; logTool: LogToolTersimpan[] };

const MENIT = 60_000;
const HARI = 24 * 60 * MENIT;
// REQ-4.1: persentase kategori dihitung atas tujuh hari terakhir, termasuk hari ini.
const HARI_KATEGORI = 7;
// WIB = UTC+7 tanpa daylight saving.
const SELISIH_WIB = 7 * 60 * MENIT;

/** Nomor hari kalender di zona Asia/Jakarta, agar "hari ini" sama dengan hitungan RPC. */
const hariWib = (t: string | Date) => Math.floor(Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(t))) / HARI);

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
    {
      id: 't-1',
      noTiket: `ADU-${tgl}-0001`,
      jenis: 'pengaduan',
      percakapanId: 'p-3',
      ringkasan: 'Keracunan setelah makan keripik kemasan tanpa label izin edar',
      status: 'belum_ditelaah',
      tglTerbit: lalu(38),
      pengaduan: { namaProduk: 'Keripik Singkong Pedas', kronologi: 'Mual dan muntah satu jam setelah makan keripik yang dibeli di warung.', kelengkapan: true, tglPengaduan: lalu(38) },
    },
    { id: 't-2', noTiket: `ESK-${tgl}-0001`, jenis: 'eskalasi', percakapanId: 'p-4', ringkasan: 'Pertanyaan keamanan obat batuk untuk ibu hamil', status: 'belum_ditelaah', tglTerbit: lalu(90) },
    {
      id: 't-3',
      noTiket: 'ADU-20261027-0003',
      jenis: 'pengaduan',
      percakapanId: 'p-7',
      ringkasan: 'Krim pemutih menyebabkan iritasi kulit',
      status: 'selesai',
      tglTerbit: lalu(3 * 24 * 60 - 10),
      pengaduan: { namaProduk: 'Krim Pemutih Glowing', kronologi: 'Kulit wajah merah dan perih setelah tiga hari pemakaian.', kelengkapan: true, tglPengaduan: lalu(3 * 24 * 60 - 10) },
    },
  ];
  const logTool: LogToolTersimpan[] = [
    { id: 4, namaTool: 'cari_basis_pengetahuan', durasiMs: 640, berhasil: true, waktu: lalu(2) },
    { id: 3, namaTool: 'cek_registrasi_bpom', durasiMs: 1820, berhasil: true, waktu: lalu(3) },
    { id: 2, namaTool: 'terbitkan_tiket_eskalasi', durasiMs: 410, berhasil: true, waktu: lalu(90) },
    { id: 1, namaTool: 'cek_registrasi_bpom', durasiMs: 5000, berhasil: false, waktu: lalu(94) },
  ];
  return { percakapan, tiket, logTool };
}

export class PenyimpananPemantauanTiruan implements PenyimpananPemantauan {
  data: DataPemantauan;
  sekarang: () => Date;

  constructor(data: DataPemantauan = contohPemantauan(), sekarang = () => new Date()) {
    this.data = data;
    this.sekarang = sekarang;
  }

  async ambilRingkasan(): Promise<DataRingkasanLayanan> {
    const hariIni = hariWib(this.sekarang());
    const { percakapan, tiket } = this.data;
    const kategori = new Map<string, number>();
    for (const p of percakapan) if (p.topik?.trim() && hariWib(p.waktuMulai) >= hariIni - (HARI_KATEGORI - 1)) kategori.set(p.topik, (kategori.get(p.topik) ?? 0) + 1);
    const total = [...kategori.values()].reduce((n, j) => n + j, 0);
    return {
      statistik: {
        panggilanHariIni: percakapan.filter((p) => hariWib(p.waktuMulai) === hariIni).length,
        jawabanOtomatisAi: percakapan.filter((p) => p.status === 'selesai_ai' && hariWib(p.waktuMulai) === hariIni).length,
        tiketEskalasiBaru: tiket.filter((t) => t.jenis === 'eskalasi' && hariWib(t.tglTerbit) === hariIni).length,
        pengaduanSelesai: tiket.filter((t) => t.jenis === 'pengaduan' && t.status === 'selesai').length,
        panggilanBerjalan: percakapan.filter((p) => p.status === 'berjalan').length,
      },
      kategori: [...kategori]
        .map(([k, jumlah]) => ({ kategori: k, jumlah, persentase: Math.round((jumlah * 10000) / total) / 100 }))
        .sort((a, b) => b.jumlah - a.jumlah || a.kategori.localeCompare(b.kategori)),
      kasusPerluTindakLanjut: tiket
        .filter((t) => t.status === 'belum_ditelaah')
        .sort((a, b) => b.tglTerbit.localeCompare(a.tglTerbit))
        .map((t) => ({ id: t.id, noTiket: t.noTiket, jenis: t.jenis, ringkasan: t.ringkasan, status: t.status, tglTerbit: t.tglTerbit, percakapanId: t.percakapanId })),
    };
  }

  async ambilPanggilanAktif(): Promise<PanggilanAktif[]> {
    const kini = this.sekarang().getTime();
    return this.data.percakapan
      .filter((p) => p.status === 'berjalan')
      .sort((a, b) => a.waktuMulai.localeCompare(b.waktuMulai))
      .map((p) => ({
        id: p.id,
        noTelp: p.noTelp,
        jenisLayanan: p.jenisInteraksi,
        topik: p.topik,
        waktuMulai: p.waktuMulai,
        durasiDetik: Math.max(0, Math.floor((kini - Date.parse(p.waktuMulai)) / 1000)),
        tahapAi: p.tahapAi,
      }));
  }

  async ambilAntreanTiket(): Promise<TiketAntrean[]> {
    return this.data.tiket.map((t) => ({
      id: t.id,
      noTiket: t.noTiket,
      jenis: t.jenis,
      ringkasan: t.ringkasan,
      status: t.status,
      waktuMasuk: t.tglTerbit,
      percakapanId: t.percakapanId,
      noTelpTersamar: this.data.percakapan.find((p) => p.id === t.percakapanId)?.noTelp ?? undefined,
    }));
  }

  // Tanpa batas rentang tanggal seperti view: data tiruan kecil, dan control hanya memakai kolom periode yang tampil.
  async ambilBebanPerJam(): Promise<BebanPerJam[]> {
    const perJam = new Map<string, BebanPerJam>();
    for (const p of this.data.percakapan) {
      const jam = `${new Date(Date.parse(p.waktuMulai) + SELISIH_WIB).toISOString().slice(0, 13)}:00:00`;
      const b = perJam.get(jam) ?? { jam, total: 0, dijawabAi: 0, dieskalasi: 0 };
      b.total++;
      if (p.status === 'selesai_ai') b.dijawabAi++;
      if (p.status === 'dieskalasi') b.dieskalasi++;
      perJam.set(jam, b);
    }
    return [...perJam.values()].sort((a, b) => a.jam.localeCompare(b.jam));
  }

  async ambilDetailKasus(noTiket: string): Promise<DetailKasusPengaduan | null> {
    const t = this.data.tiket.find((x) => x.noTiket === noTiket);
    if (!t) return null;
    const p = this.data.percakapan.find((x) => x.id === t.percakapanId);
    return {
      tiketId: t.id,
      noTiket: t.noTiket,
      jenis: t.jenis,
      status: t.status,
      ringkasan: t.ringkasan,
      tglTerbit: t.tglTerbit,
      percakapanId: t.percakapanId,
      ...(t.pengaduan ?? {}),
      namaPelaporTersamar: p?.namaPelapor ?? undefined,
      noTelpTersamar: p?.noTelp ?? undefined,
    };
  }

  async ambilLogTool(batas: number) {
    return [...this.data.logTool].sort((a, b) => b.waktu.localeCompare(a.waktu) || b.id - a.id).slice(0, batas);
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

/** Penyimpanan kosong yang isinya diatur per test. */
export class PenyimpananPemantauanMock implements PenyimpananPemantauan {
  private data: DataRingkasanLayanan;
  private panggilanAktif: PanggilanAktif[];
  private antreanTiket: TiketAntrean[];
  private detailKasus: Map<string, DetailKasusPengaduan>;

  constructor(opsi?: {
    ringkasan?: Partial<DataRingkasanLayanan>;
    panggilanAktif?: PanggilanAktif[];
    antreanTiket?: TiketAntrean[];
    detailKasus?: DetailKasusPengaduan[];
  }) {
    this.data = {
      statistik: opsi?.ringkasan?.statistik ?? {
        panggilanHariIni: 0,
        jawabanOtomatisAi: 0,
        tiketEskalasiBaru: 0,
        pengaduanSelesai: 0,
        panggilanBerjalan: 0,
      },
      kategori: opsi?.ringkasan?.kategori ?? [],
      kasusPerluTindakLanjut: opsi?.ringkasan?.kasusPerluTindakLanjut ?? [],
    };
    this.panggilanAktif = opsi?.panggilanAktif ?? [];
    this.antreanTiket = opsi?.antreanTiket ?? [];
    this.detailKasus = new Map((opsi?.detailKasus ?? []).map((d) => [d.noTiket, d]));
  }

  async ambilRingkasan(): Promise<DataRingkasanLayanan> {
    return this.data;
  }

  async ambilStatistik(): Promise<StatistikLayanan> {
    return this.data.statistik;
  }

  async ambilPanggilanAktif(): Promise<PanggilanAktif[]> {
    return this.panggilanAktif;
  }

  async ambilAntreanTiket(): Promise<TiketAntrean[]> {
    return this.antreanTiket;
  }

  async ambilDetailKasus(noTiket: string): Promise<DetailKasusPengaduan | null> {
    return this.detailKasus.get(noTiket) ?? null;
  }
}
