// Penanganan tiruan (UC-06) untuk pengembangan lokal dan test tanpa Supabase (PROJECT_RULES 4.3). Menjalankan mesin
// status PRD-rinci UC-06 pada tiket contoh pemantauan, menggantikan RPC simpan_telaah, simpan_jadwal_pemeriksaan,
// simpan_tanggapan, dan tutup_tiket.
import type { StatusTiket } from '../PemantauanLayananController.ts';
import { GalatPenanganan, type PenyimpananPenanganan, type TindakLanjut } from '../PenangananController.ts';
import { contohPemantauan, type TiketTiruan } from './pemantauanTiruan.ts';

// Perlu Pemeriksaan Lapangan baru menjadi Menunggu Pemeriksaan setelah jadwal tersimpan (REQ-6.2).
const STATUS_SESUDAH_TELAAH: Record<TindakLanjut, StatusTiket> = {
  telaah_dokumen: 'sedang_ditelaah',
  perlu_pemeriksaan_lapangan: 'sedang_ditelaah',
  bukan_kewenangan_bpom: 'diteruskan',
};
// Status asal yang sah per aksi. Diteruskan dan Selesai tidak lanjut ke tahap mana pun (BR-3).
const DAPAT_DITELAAH: StatusTiket[] = ['belum_ditelaah', 'sedang_ditelaah', 'menunggu_pemeriksaan', 'tanggapan_disusun'];
const DAPAT_DIJADWALKAN: StatusTiket[] = ['sedang_ditelaah', 'menunggu_pemeriksaan'];
const DAPAT_DITANGGAPI: StatusTiket[] = ['sedang_ditelaah', 'menunggu_pemeriksaan', 'tanggapan_disusun'];
const BELUM_DITANGGAPI: StatusTiket[] = ['belum_ditelaah', 'sedang_ditelaah', 'menunggu_pemeriksaan'];
// Menutup ulang tiket Selesai tidak mengubah apa pun, seperti tutup_tiket yang tidak mengantrekan notifikasi ganda.
const DAPAT_DITUTUP: StatusTiket[] = ['tanggapan_disusun', 'selesai'];

export class PenyimpananPenangananTiruan implements PenyimpananPenanganan {
  tiket: TiketTiruan[];

  constructor(tiket: TiketTiruan[] = contohPemantauan().tiket) {
    this.tiket = tiket;
  }

  cari(noTiket: string) {
    const t = this.tiket.find((x) => x.noTiket === noTiket);
    if (!t) throw new GalatPenanganan('tiket_tidak_ada');
    return t;
  }

  ubah(noTiket: string, asal: StatusTiket[], tujuan: StatusTiket) {
    const t = this.cari(noTiket);
    if (!asal.includes(t.status)) throw new GalatPenanganan('transisi_tidak_sah');
    t.status = tujuan;
    return tujuan;
  }

  async simpanTelaah(noTiket: string, tindakLanjut: TindakLanjut) {
    return this.ubah(noTiket, DAPAT_DITELAAH, STATUS_SESUDAH_TELAAH[tindakLanjut]);
  }

  async simpanJadwal(noTiket: string) {
    return this.ubah(noTiket, DAPAT_DIJADWALKAN, 'menunggu_pemeriksaan');
  }

  async simpanTanggapan(noTiket: string) {
    return this.ubah(noTiket, DAPAT_DITANGGAPI, 'tanggapan_disusun');
  }

  // BR-2: tiket yang masih ditangani tetapi belum punya tanggapan ditolak dengan galat tersendiri.
  async tutupTiket(noTiket: string) {
    if (BELUM_DITANGGAPI.includes(this.cari(noTiket).status)) throw new GalatPenanganan('tanpa_tanggapan');
    return this.ubah(noTiket, DAPAT_DITUTUP, 'selesai');
  }
}
