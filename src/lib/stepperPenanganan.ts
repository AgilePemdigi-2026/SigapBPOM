// Boundary & Control helper untuk StepperPenanganan (UC-06, SRS 3.1.10, REQ-6.1 - REQ-6.6, BR-2, BR-3).
// Menghubungkan Boundary StepperPenanganan dengan endpoint backend / PenangananController.
import {
  PESAN_TELAAH_TERSIMPAN,
  PESAN_BUKAN_KEWENANGAN,
  PESAN_JADWAL_TERSIMPAN,
  PESAN_TANGGAPAN_TERSIMPAN,
  PESAN_TUTUP_TIKET,
  PESAN_TUTUP_TANPA_TANGGAPAN,
  OPSI_TINDAK_LANJUT,
  type TindakLanjut,
} from './PenangananController.ts';

export {
  PESAN_TELAAH_TERSIMPAN,
  PESAN_BUKAN_KEWENANGAN,
  PESAN_JADWAL_TERSIMPAN,
  PESAN_TANGGAPAN_TERSIMPAN,
  PESAN_TUTUP_TIKET,
  PESAN_TUTUP_TANPA_TANGGAPAN,
  OPSI_TINDAK_LANJUT,
  type TindakLanjut,
};

export type TahapStepper = 'Telaah' | 'Jadwal Pemeriksaan' | 'Susun Tanggapan' | 'Selesai';

export const DAFTAR_TAHAP: readonly TahapStepper[] = [
  'Telaah',
  'Jadwal Pemeriksaan',
  'Susun Tanggapan',
  'Selesai',
] as const;

export type StatusTahap = 'aktif' | 'selesai' | 'dilewati' | 'menunggu';

export type ResponApiPenanganan = {
  status: 'success' | 'error';
  message: string;
  data?: {
    noTiket: string;
    status: string | null;
    labelStatus: string | null;
  } | null;
};

/** Interface layanan API penanganan pengaduan (PROJECT_RULES 4.3). */
export interface KlienPenangananApi {
  simpanTelaah(noTiket: string, tindakLanjut: TindakLanjut, catatan?: string | null): Promise<ResponApiPenanganan>;
  simpanJadwal(noTiket: string, tanggal: string, unit: string): Promise<ResponApiPenanganan>;
  simpanTanggapan(noTiket: string, isi: string): Promise<ResponApiPenanganan>;
  tutupTiket(noTiket: string): Promise<ResponApiPenanganan>;
}

/** Memformat tanggal YYYY-MM-DD dari format input apa pun (mis. DD-MM-YYYY). */
export function formatTanggalIso(input: string): string {
  const t = input.trim();
  const ddmmyyyy = t.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }
  return t;
}

/** Implementasi klien penanganan menggunakan fetch HTTP ke endpoint dashboard. */
export class KlienPenangananApiFetch implements KlienPenangananApi {
  fetchFn: typeof fetch;
  baseUrl: string;

  constructor(opsi: { baseUrl?: string; fetch?: typeof fetch } = {}) {
    this.baseUrl = (opsi.baseUrl ?? '').replace(/\/+$/, '');
    this.fetchFn = opsi.fetch ?? fetch.bind(globalThis);
  }

  async simpanTelaah(noTiket: string, tindakLanjut: TindakLanjut, catatan?: string | null): Promise<ResponApiPenanganan> {
    const res = await this.fetchFn(`${this.baseUrl}/api/pengaduan/${encodeURIComponent(noTiket)}/telaah`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tindakLanjut, catatan: catatan ?? null }),
    });
    const d = (await res.json().catch(() => null)) as ResponApiPenanganan | null;
    return d ?? { status: 'error', message: 'Terjadi kesalahan pada sistem.', data: null };
  }

  async simpanJadwal(noTiket: string, tanggal: string, unit: string): Promise<ResponApiPenanganan> {
    const res = await this.fetchFn(`${this.baseUrl}/api/pengaduan/${encodeURIComponent(noTiket)}/jadwal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tanggal: formatTanggalIso(tanggal), unit }),
    });
    const d = (await res.json().catch(() => null)) as ResponApiPenanganan | null;
    return d ?? { status: 'error', message: 'Terjadi kesalahan pada sistem.', data: null };
  }

  async simpanTanggapan(noTiket: string, isi: string): Promise<ResponApiPenanganan> {
    const res = await this.fetchFn(`${this.baseUrl}/api/pengaduan/${encodeURIComponent(noTiket)}/tanggapan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isi }),
    });
    const d = (await res.json().catch(() => null)) as ResponApiPenanganan | null;
    return d ?? { status: 'error', message: 'Terjadi kesalahan pada sistem.', data: null };
  }

  async tutupTiket(noTiket: string): Promise<ResponApiPenanganan> {
    const res = await this.fetchFn(`${this.baseUrl}/api/pengaduan/${encodeURIComponent(noTiket)}/tutup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const d = (await res.json().catch(() => null)) as ResponApiPenanganan | null;
    return d ?? { status: 'error', message: 'Terjadi kesalahan pada sistem.', data: null };
  }
}

/** Implementasi tiruan (mock) KlienPenangananApi untuk pengujian UI tanpa server aktif. */
export class KlienPenangananApiMock implements KlienPenangananApi {
  status: string;
  labelStatus: string;
  punyaTanggapan: boolean = false;
  riwayatAksi: string[] = [];

  constructor(statusAwal: string = 'belum_ditelaah', labelAwal: string = 'Belum Ditelaah') {
    this.status = statusAwal;
    this.labelStatus = labelAwal;
  }

  async simpanTelaah(noTiket: string, tindakLanjut: TindakLanjut, _catatan?: string | null): Promise<ResponApiPenanganan> {
    this.riwayatAksi.push(`telaah:${tindakLanjut}`);
    if (tindakLanjut === 'Bukan Kewenangan BPOM') {
      this.status = 'diteruskan';
      this.labelStatus = 'Diteruskan ke Instansi Lain';
      return {
        status: 'success',
        message: PESAN_BUKAN_KEWENANGAN,
        data: { noTiket, status: this.status, labelStatus: this.labelStatus },
      };
    }

    this.status = 'sedang_ditelaah';
    this.labelStatus = 'Sedang Ditelaah';
    return {
      status: 'success',
      message: PESAN_TELAAH_TERSIMPAN,
      data: { noTiket, status: this.status, labelStatus: this.labelStatus },
    };
  }

  async simpanJadwal(noTiket: string, tanggal: string, unit: string): Promise<ResponApiPenanganan> {
    this.riwayatAksi.push(`jadwal:${tanggal}:${unit}`);
    this.status = 'menunggu_pemeriksaan';
    this.labelStatus = 'Menunggu Pemeriksaan';
    return {
      status: 'success',
      message: PESAN_JADWAL_TERSIMPAN,
      data: { noTiket, status: this.status, labelStatus: this.labelStatus },
    };
  }

  async simpanTanggapan(noTiket: string, isi: string): Promise<ResponApiPenanganan> {
    this.riwayatAksi.push(`tanggapan:${isi}`);
    this.punyaTanggapan = true;
    this.status = 'tanggapan_disusun';
    this.labelStatus = 'Tanggapan Disusun';
    return {
      status: 'success',
      message: PESAN_TANGGAPAN_TERSIMPAN,
      data: { noTiket, status: this.status, labelStatus: this.labelStatus },
    };
  }

  async tutupTiket(noTiket: string): Promise<ResponApiPenanganan> {
    this.riwayatAksi.push('tutup');
    if (!this.punyaTanggapan && this.status !== 'tanggapan_disusun') {
      return {
        status: 'error',
        message: PESAN_TUTUP_TANPA_TANGGAPAN,
        data: null,
      };
    }
    this.status = 'selesai';
    this.labelStatus = 'Selesai';
    return {
      status: 'success',
      message: PESAN_TUTUP_TIKET,
      data: { noTiket, status: this.status, labelStatus: this.labelStatus },
    };
  }
}

export interface StateStepper {
  noTiket: string;
  status: string;
  labelStatus: string;
  tindakLanjut: TindakLanjut | null;
  jadwalDibutuhkan: boolean;
  pesanTerakhir: string | null;
  tipePesan: 'success' | 'error' | null;
  tahapAktif: TahapStepper;
  statusTahap: Record<TahapStepper, StatusTahap>;
}

/** Menghitung status tiap tahap stepper berdasarkan status tiket dan pilihan tindak lanjut. */
export function hitungStatusTahap(
  status: string,
  tindakLanjut: TindakLanjut | null,
  jadwalDibutuhkan: boolean
): Record<TahapStepper, StatusTahap> {
  if (status === 'selesai') {
    return {
      Telaah: 'selesai',
      'Jadwal Pemeriksaan': jadwalDibutuhkan ? 'selesai' : 'dilewati',
      'Susun Tanggapan': 'selesai',
      Selesai: 'selesai',
    };
  }

  if (status === 'diteruskan') {
    return {
      Telaah: 'selesai',
      'Jadwal Pemeriksaan': 'dilewati',
      'Susun Tanggapan': 'dilewati',
      Selesai: 'dilewati',
    };
  }

  if (status === 'tanggapan_disusun') {
    return {
      Telaah: 'selesai',
      'Jadwal Pemeriksaan': jadwalDibutuhkan ? 'selesai' : 'dilewati',
      'Susun Tanggapan': 'selesai',
      Selesai: 'aktif',
    };
  }

  if (status === 'menunggu_pemeriksaan') {
    return {
      Telaah: 'selesai',
      'Jadwal Pemeriksaan': 'selesai',
      'Susun Tanggapan': 'aktif',
      Selesai: 'menunggu',
    };
  }

  if (status === 'sedang_ditelaah') {
    if (tindakLanjut === 'Perlu Pemeriksaan Lapangan') {
      return {
        Telaah: 'selesai',
        'Jadwal Pemeriksaan': 'aktif',
        'Susun Tanggapan': 'menunggu',
        Selesai: 'menunggu',
      };
    }
    return {
      Telaah: 'selesai',
      'Jadwal Pemeriksaan': 'dilewati',
      'Susun Tanggapan': 'aktif',
      Selesai: 'menunggu',
    };
  }

  // belum_ditelaah
  return {
    Telaah: 'aktif',
    'Jadwal Pemeriksaan': 'menunggu',
    'Susun Tanggapan': 'menunggu',
    Selesai: 'menunggu',
  };
}

/** Menentukan tahap aktif saat ini dari statusTahap. */
export function tentukanTahapAktif(statusTahap: Record<TahapStepper, StatusTahap>): TahapStepper {
  for (const t of DAFTAR_TAHAP) {
    if (statusTahap[t] === 'aktif') return t;
  }
  if (statusTahap.Selesai === 'selesai') return 'Selesai';
  return 'Telaah';
}

/**
 * Controller alur stepper penanganan di sisi frontend.
 * Mengelola transisi status UI dan memanggil KlienPenangananApi sesuai keempat jalur SRS.
 */
export class StepperPenangananFlow {
  klien: KlienPenangananApi;
  state: StateStepper;

  constructor(klien: KlienPenangananApi, noTiket: string, statusAwal: string = 'belum_ditelaah', labelAwal: string = 'Belum Ditelaah') {
    this.klien = klien;
    const jadwalDibutuhkan = statusAwal === 'menunggu_pemeriksaan';
    const statusTahap = hitungStatusTahap(statusAwal, null, jadwalDibutuhkan);
    this.state = {
      noTiket,
      status: statusAwal,
      labelStatus: labelAwal,
      tindakLanjut: null,
      jadwalDibutuhkan,
      pesanTerakhir: null,
      tipePesan: null,
      tahapAktif: tentukanTahapAktif(statusTahap),
      statusTahap,
    };
  }

  /** Basic Path, Alternative Path 1, Alternative Path 2 (Langkah 5-7). */
  async simpanTelaah(tindakLanjut: TindakLanjut, catatan?: string | null): Promise<ResponApiPenanganan> {
    this.state.tindakLanjut = tindakLanjut;
    const res = await this.klien.simpanTelaah(this.state.noTiket, tindakLanjut, catatan);
    this.state.pesanTerakhir = res.message;
    this.state.tipePesan = res.status;

    if (res.status === 'success' && res.data) {
      this.state.status = res.data.status ?? this.state.status;
      this.state.labelStatus = res.data.labelStatus ?? this.state.labelStatus;

      if (tindakLanjut === 'Perlu Pemeriksaan Lapangan') {
        this.state.jadwalDibutuhkan = true;
      }

      this.state.statusTahap = hitungStatusTahap(this.state.status, tindakLanjut, this.state.jadwalDibutuhkan);
      this.state.tahapAktif = tentukanTahapAktif(this.state.statusTahap);
    }
    return res;
  }

  /** Alternative Path 2 (Langkah 9-11). */
  async simpanJadwal(tanggal: string, unit: string): Promise<ResponApiPenanganan> {
    const res = await this.klien.simpanJadwal(this.state.noTiket, tanggal, unit);
    this.state.pesanTerakhir = res.message;
    this.state.tipePesan = res.status;

    if (res.status === 'success' && res.data) {
      this.state.status = res.data.status ?? this.state.status;
      this.state.labelStatus = res.data.labelStatus ?? this.state.labelStatus;
      this.state.jadwalDibutuhkan = true;

      this.state.statusTahap = hitungStatusTahap(this.state.status, this.state.tindakLanjut, true);
      this.state.tahapAktif = tentukanTahapAktif(this.state.statusTahap);
    }
    return res;
  }

  /** Basic Path & Alternative Path 2 (Langkah Tanggapan). */
  async simpanTanggapan(isi: string): Promise<ResponApiPenanganan> {
    const res = await this.klien.simpanTanggapan(this.state.noTiket, isi);
    this.state.pesanTerakhir = res.message;
    this.state.tipePesan = res.status;

    if (res.status === 'success' && res.data) {
      this.state.status = res.data.status ?? this.state.status;
      this.state.labelStatus = res.data.labelStatus ?? this.state.labelStatus;

      this.state.statusTahap = hitungStatusTahap(this.state.status, this.state.tindakLanjut, this.state.jadwalDibutuhkan);
      this.state.tahapAktif = tentukanTahapAktif(this.state.statusTahap);
    }
    return res;
  }

  /** Basic Path & Exception Path 1 (Langkah Penutupan Tiket). */
  async tutupTiket(): Promise<ResponApiPenanganan> {
    const res = await this.klien.tutupTiket(this.state.noTiket);
    this.state.pesanTerakhir = res.message;
    this.state.tipePesan = res.status;

    // Status baru berubah HANYA JIKA server merespons sukses (REQ, Jangan aturan)!
    if (res.status === 'success' && res.data) {
      this.state.status = res.data.status ?? 'selesai';
      this.state.labelStatus = res.data.labelStatus ?? 'Selesai';

      this.state.statusTahap = hitungStatusTahap(this.state.status, this.state.tindakLanjut, this.state.jadwalDibutuhkan);
      this.state.tahapAktif = tentukanTahapAktif(this.state.statusTahap);
    }
    return res;
  }
}
