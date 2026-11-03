// Control UC-04 pelaporan panggilan aktif (T-F5.2-02, REQ-4.2): gateway memberi tahu dashboard panggilan yang sedang berjalan,
// tahap pemrosesan AI terbarunya, dan heartbeat berkala. Yang dikirim hanya id panggilan, jenis layanan, topik baku, dan tahap:
// tidak ada transkrip, nomor telepon, atau alamat IP. Kegagalan pelaporan tidak pernah mengganggu panggilan.

/** Tahap pemrosesan AI (REQ-4.2). */
export const TAHAP = Object.freeze({ MENDENGAR: 'mendengar', MEMPROSES: 'memproses', MENJAWAB: 'menjawab' });

/** Topik baku (bukan isi ucapan) agar dashboard tidak memuat data penelepon. */
export const TOPIK = Object.freeze({
  INFORMASI: 'Informasi produk',
  PENGADUAN: 'Pengaduan produk',
  ESKALASI: 'Eskalasi ke petugas',
});

const JENIS_LAYANAN = { 1: 'informasi_produk', 2: 'pengaduan' };

/** Jenis layanan dan topik dari keadaan panggilan: layanan menu (1 atau 2, atau null) dan apakah sedang eskalasi. */
export function ringkasanPanggilan({ layanan = null, eskalasi = false } = {}) {
  const jenisLayanan = JENIS_LAYANAN[layanan] ?? null;
  const topik = eskalasi ? TOPIK.ESKALASI : layanan === 1 ? TOPIK.INFORMASI : layanan === 2 ? TOPIK.PENGADUAN : null;
  return { jenisLayanan, topik };
}

/** Interface pelapor: `laporkan({percakapanId, jenisLayanan, topik, tahap})` dan `akhiri(percakapanId)`. */
export class PelaporPanggilanTiruan {
  constructor(now = () => Date.now(), batasHeartbeatMs = 60_000) {
    this.now = now;
    this.batasHeartbeatMs = batasHeartbeatMs;
    this.panggilan = new Map();
    this.jumlahTulis = 0;
  }

  async laporkan({ percakapanId, jenisLayanan = null, topik = null, tahap = null }) {
    this.jumlahTulis += 1;
    const p = this.panggilan.get(percakapanId);
    if (p && p.selesai) return;
    this.panggilan.set(percakapanId, {
      mulai: p?.mulai ?? this.now(),
      jenisLayanan: jenisLayanan ?? p?.jenisLayanan ?? null,
      topik: topik ?? p?.topik ?? null,
      tahap: tahap ?? p?.tahap ?? null,
      heartbeat: this.now(),
      selesai: false,
    });
  }

  async akhiri(percakapanId) {
    this.jumlahTulis += 1;
    const p = this.panggilan.get(percakapanId);
    if (p) p.selesai = true;
  }

  /** Daftar panggilan aktif: belum berakhir dan heartbeat belum lewat batas (meniru view panggilan_berjalan). */
  daftarAktif() {
    const sekarang = this.now();
    return [...this.panggilan]
      .filter(([, p]) => !p.selesai && sekarang - p.heartbeat <= this.batasHeartbeatMs)
      .map(([percakapanId, p]) => ({ percakapanId, ...p }));
  }
}

/** Implementasi lewat Edge Function `laporkan-panggilan-aktif`, dengan kunci internal bersama (bukan service_role). */
export class PelaporPanggilanSupabase {
  constructor(url, kunci) {
    this.url = url.replace(/\/$/, '');
    this.kunci = kunci;
  }

  async kirim(body) {
    const r = await fetch(`${this.url}/functions/v1/laporkan-panggilan-aktif`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sigap-kunci': this.kunci },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) throw new Error(`pantau ${r.status}`);
  }

  laporkan({ percakapanId, jenisLayanan, topik, tahap }) {
    return this.kirim({ aksi: 'laporkan', percakapanId, jenisLayanan, topik, tahap });
  }

  akhiri(percakapanId) {
    return this.kirim({ aksi: 'akhiri', percakapanId });
  }
}

/**
 * Pelacak panggilan aktif. `tahap()` dipanggil dari alur giliran; penulisan ke pelapor di-throttle:
 *  - perubahan tahap/layanan/topik ditulis paling cepat sekali per `jedaMinMs` (yang tertunda ditulis pada tik berikutnya),
 *  - panggilan yang tidak berubah tetap mengirim heartbeat tiap `heartbeatMs`,
 *  - panggilan tanpa aktivitas selama `diamMs` berhenti dilacak dan heartbeat-nya berhenti (penelepon mungkin pergi tanpa
 *    memanggil /voice/akhiri). Panggilan tidak ditutup di sini: view menyembunyikannya setelah batas heartbeat dan penyapu
 *    basis data menutupnya, sedangkan penelepon yang ternyata masih ada dicatat lagi pada giliran berikutnya selama barisnya belum disapu,
 *  - jumlah panggilan terlacak dibatasi `maks` agar gateway publik tidak dipakai membanjiri basis data.
 * Tidak ada penulisan per potongan audio: hanya per perubahan tahap.
 */
export class PemantauPanggilan {
  constructor({
    pelapor, konteks = () => ({}), now = () => Date.now(), onGalat = () => {},
    heartbeatMs = 15_000, jedaMinMs = 2_000, diamMs = 90_000, maks = 200,
  }) {
    this.pelapor = pelapor;
    this.konteks = konteks;
    this.now = now;
    this.onGalat = onGalat;
    this.batas = { heartbeatMs, jedaMinMs, diamMs, maks };
    this.sesi = new Map();
    this.timer = null;
  }

  /** Mulai tik berkala. Timer tidak menahan proses tetap hidup. */
  mulai(intervalMs = 1_000) {
    if (this.timer) return;
    this.timer = setInterval(() => { this.tik(); }, intervalMs);
    this.timer.unref?.();
  }

  berhenti() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Catat tahap terbaru. Tidak pernah melempar galat dan tidak menunggu jaringan. */
  tahap(id, tahap) {
    try {
      const sekarang = this.now();
      let s = this.sesi.get(id);
      if (!s) {
        if (this.sesi.size >= this.batas.maks) return;
        s = { terkirim: null, kirimTerakhir: 0, sedangKirim: false };
        this.sesi.set(id, s);
      }
      s.aktif = sekarang;
      s.kini = { tahap, ...ringkasanPanggilan(this.konteks(id)) };
      if (this.berubah(s) && sekarang - s.kirimTerakhir >= this.batas.jedaMinMs) this.kirim(id, s);
    } catch (e) {
      this.onGalat(e);
    }
  }

  /** Panggilan berakhir (penelepon menekan akhiri). Mengembalikan promise yang tidak pernah ditolak. */
  async akhiri(id) {
    const s = this.sesi.get(id);
    if (!s) return;
    this.sesi.delete(id);
    try {
      // Tunggu laporan yang masih di jalan agar tidak membuat baris `berjalan` baru setelah panggilan ditutup.
      await s.kiriman;
      await this.pelapor.akhiri(id);
    } catch (e) {
      this.onGalat(e);
    }
  }

  /** Dipanggil berkala: kirim perubahan tertunda dan heartbeat, lepas panggilan yang diam tanpa menutupnya. */
  tik() {
    const sekarang = this.now();
    for (const [id, s] of this.sesi) {
      if (sekarang - s.aktif > this.batas.diamMs) {
        this.sesi.delete(id);
      } else if (this.berubah(s) ? sekarang - s.kirimTerakhir >= this.batas.jedaMinMs : sekarang - s.kirimTerakhir >= this.batas.heartbeatMs) {
        this.kirim(id, s);
      }
    }
  }

  berubah(s) {
    const t = s.terkirim;
    return !t || t.tahap !== s.kini.tahap || t.jenisLayanan !== s.kini.jenisLayanan || t.topik !== s.kini.topik;
  }

  kirim(id, s) {
    if (s.sedangKirim) return;
    s.sedangKirim = true;
    s.kirimTerakhir = this.now();
    const data = { ...s.kini };
    s.kiriman = Promise.resolve()
      .then(() => this.pelapor.laporkan({ percakapanId: id, ...data }))
      .then(() => { s.terkirim = data; })
      .catch((e) => this.onGalat(e))
      .finally(() => { s.sedangKirim = false; });
  }
}
