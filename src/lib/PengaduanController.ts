// Control UC-02 Menyampaikan Pengaduan Produk di panel suara (REQ-1.1, REQ-2.1, REQ-2.2, REQ-2.4, REQ-2.5, T-F4.1-03).
// Menghubungkan Boundary PanelSuara dengan external adapter Voice Gateway sesuai pola BCE dan nama class diagram SRS.

/** Kamus pesan PRD-rinci Lampiran A (UC-01, UC-02 "Panggilan tersambung", REQ-1.1). */
export const PESAN_MENU = 'Tekan 1 untuk informasi produk, tekan 2 untuk pengaduan.';

/** Kamus pesan PRD-rinci Lampiran A (UC-01 "Tekan 1"). */
export const PESAN_LAYANAN_1 = 'Silakan sebutkan nama produk atau pertanyaan Anda.';

/** Kamus pesan PRD-rinci Lampiran A (UC-02 "Tekan 2", REQ-2.1). */
export const PESAN_LAYANAN_2 = 'Silakan sebutkan nama produk, kronologi kejadian, nama, dan nomor telepon Anda.';

/** Kamus pesan PRD-rinci Lampiran A (UC-02 "Data kurang (contoh)", REQ-2.2). */
export const PESAN_DATA_KURANG = 'Mohon sebutkan nomor telepon Anda.';

/** Kamus pesan PRD-rinci Lampiran A (UC-02 "Panggilan putus, data kurang", REQ-2.5). */
export const PESAN_PENGADUAN_TIDAK_LENGKAP = 'Panggilan berakhir. Pengaduan belum lengkap sehingga nomor tiket tidak diterbitkan.';

/** Kamus pesan PRD-rinci Lampiran A (UC-02 "Tiket pengaduan terbit", REQ-2.4). */
export const pesanTiketPengaduan = (nomorTiket: string) =>
  `Pengaduan Anda telah dicatat dengan nomor tiket ${nomorTiket}. Tindak lanjut akan dikirim melalui SMS.`;

export type HasilGiliran = {
  transkrip: string | null;
  jawaban: string | null;
  suara: string | null;
  akhiri?: boolean;
  tiket?: string;
  pengaduan?: string | null;
};

/** Adapter layanan eksternal Voice Gateway (PROJECT_RULES 4.3). */
export interface KlienVoiceGateway {
  kirimPilihan(idPanggilan: string, pilih: 1 | 2): Promise<HasilGiliran>;
  kirimUcapan(idPanggilan: string, audio: Blob): Promise<HasilGiliran>;
  akhiriPanggilan?(idPanggilan: string): Promise<void>;
}

/** Implementasi produksi Voice Gateway via HTTP POST /voice. */
export class VoiceGatewayHttp implements KlienVoiceGateway {
  baseUrl: string;
  fetchFn: typeof fetch;

  constructor(opsi: { baseUrl?: string; fetch?: typeof fetch } = {}) {
    this.baseUrl = (opsi.baseUrl ?? '/voice').replace(/\/+$/, '');
    this.fetchFn = opsi.fetch ?? fetch.bind(globalThis);
  }

  async kirimPilihan(idPanggilan: string, pilih: 1 | 2): Promise<HasilGiliran> {
    const res = await this.fetchFn(`${this.baseUrl}/giliran`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: idPanggilan, pilih }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.data) {
      throw new Error(data?.message ?? 'Layanan suara sedang gangguan. Silakan coba lagi.');
    }
    return data.data as HasilGiliran;
  }

  async kirimUcapan(idPanggilan: string, audio: Blob): Promise<HasilGiliran> {
    const res = await this.fetchFn(`${this.baseUrl}/giliran?id=${encodeURIComponent(idPanggilan)}`, {
      method: 'POST',
      headers: { 'content-type': audio.type || 'audio/webm' },
      body: audio,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.data) {
      throw new Error(data?.message ?? 'Layanan suara sedang gangguan. Silakan coba lagi.');
    }
    return data.data as HasilGiliran;
  }

  async akhiriPanggilan(idPanggilan: string): Promise<void> {
    await this.fetchFn(`${this.baseUrl}/akhiri`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: idPanggilan }),
    }).catch(() => {});
  }
}

/** Implementasi tiruan Voice Gateway untuk pengujian dan demo dev server. */
export class VoiceGatewayTiruan implements KlienVoiceGateway {
  daftarGiliran: HasilGiliran[];
  pilihanTerakhir: { idPanggilan: string; pilih: 1 | 2 } | null = null;

  constructor(daftarGiliran: HasilGiliran[] = []) {
    this.daftarGiliran = [...daftarGiliran];
  }

  async kirimPilihan(idPanggilan: string, pilih: 1 | 2): Promise<HasilGiliran> {
    this.pilihanTerakhir = { idPanggilan, pilih };
    if (this.daftarGiliran.length > 0) {
      return this.daftarGiliran.shift()!;
    }
    const jawaban = pilih === 1 ? PESAN_LAYANAN_1 : PESAN_LAYANAN_2;
    return {
      transkrip: null,
      jawaban,
      suara: `/voice/statis/layanan-${pilih}`,
    };
  }

  async kirimUcapan(_idPanggilan: string, _audio: Blob): Promise<HasilGiliran> {
    if (this.daftarGiliran.length > 0) {
      return this.daftarGiliran.shift()!;
    }
    return { transkrip: null, jawaban: null, suara: null };
  }

  async akhiriPanggilan(_idPanggilan: string): Promise<void> {}
}

export type PesanTranskrip = {
  peran: 'sistem' | 'pengguna';
  teks: string;
  waktu?: string;
  tiket?: string;
};

/**
 * Control UC-02: PengaduanController
 * Mengelola alur pengaduan suara: pemilihan menu 2, prompt awal pengaduan,
 * prompt tanya ulang data kurang, dan pencatatan nomor tiket pengaduan.
 */
export class PengaduanController {
  gateway: KlienVoiceGateway;
  transkrip: PesanTranskrip[] = [];
  layananDipilih: 1 | 2 | null = null;
  idPanggilan: string;

  constructor(gateway: KlienVoiceGateway, idPanggilan: string = crypto.randomUUID()) {
    this.gateway = gateway;
    this.idPanggilan = idPanggilan;
  }

  /**
   * REQ-1.1, REQ-2.1: Menangani pemilihan menu 2 (Pengaduan Produk) atau 1 (Informasi Produk).
   * Mengirim pilihan ke Voice Gateway dan menambahkan respon sistem ke transkrip langsung.
   */
  async pilihLayanan(nomor: 1 | 2): Promise<HasilGiliran> {
    this.layananDipilih = nomor;
    const hasil = await this.gateway.kirimPilihan(this.idPanggilan, nomor);
    if (hasil.jawaban) {
      this.transkrip.push({
        peran: 'sistem',
        teks: hasil.jawaban,
        tiket: hasil.tiket ?? hasil.pengaduan ?? undefined,
      });
    }
    return hasil;
  }

  /**
   * REQ-2.2: Menangani transkrip prompt tanya ulang data pengaduan yang belum lengkap.
   */
  tanganiPromptTanyaUlang(teksPrompt: string = PESAN_DATA_KURANG): PesanTranskrip {
    const pesan: PesanTranskrip = { peran: 'sistem', teks: teksPrompt };
    this.transkrip.push(pesan);
    return pesan;
  }

  /**
   * REQ-2.3, REQ-2.4: Menangani transkrip saat tiket pengaduan terbit.
   */
  tanganiTiketTerbit(nomorTiket: string): PesanTranskrip {
    const pesan: PesanTranskrip = {
      peran: 'sistem',
      teks: pesanTiketPengaduan(nomorTiket),
      tiket: nomorTiket,
    };
    this.transkrip.push(pesan);
    return pesan;
  }

  /**
   * REQ-2.5: Menangani panggilan berakhir saat data pengaduan belum lengkap.
   */
  tanganiPanggilanBerakhirDataKurang(): PesanTranskrip {
    const pesan: PesanTranskrip = { peran: 'sistem', teks: PESAN_PENGADUAN_TIDAK_LENGKAP };
    this.transkrip.push(pesan);
    return pesan;
  }
}

