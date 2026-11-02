// Adapter UC-02 Voice Gateway (PROJECT_RULES 4.3): layanan eksternal di balik interface, masing-masing dengan implementasi tiruan.
//
// Gerbang pengaduan: `terbitkanTiket(data) -> nomorTiket`, `simpanTidakLengkap(data) -> void`.
// Pengirim SMS: `kirim(nomorTelepon, teks) -> void`.
// Gateway tidak pernah memegang service_role: gerbang Supabase memanggil Edge Function dengan kunci internal bersama.

const BATAS_WAKTU_MS = 15_000;

/** Implementasi lewat Edge Function `terbitkan-tiket-pengaduan` dan `simpan-pengaduan-tidak-lengkap` (supabase/README.md). */
export class GerbangPengaduanSupabase {
  constructor(url, kunci) {
    this.url = url.replace(/\/$/, '');
    this.kunci = kunci;
  }

  async panggil(fungsi, body) {
    const r = await fetch(`${this.url}/functions/v1/${fungsi}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sigap-kunci': this.kunci },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(BATAS_WAKTU_MS),
    });
    const d = await r.json().catch(() => null);
    // Galat hanya membawa kode status: isi respons dan data pelapor tidak ikut ke log.
    if (!r.ok || d?.status !== 'success') throw new Error(`${fungsi} ${r.status}`);
    return d.data;
  }

  async terbitkanTiket({ percakapanId, namaProduk, kronologi, namaPelapor, nomorTelepon }) {
    const data = await this.panggil('terbitkan-tiket-pengaduan', { percakapanId, namaProduk, kronologi, namaPelapor, nomorTelepon });
    if (!data?.nomorTiket) throw new Error('terbitkan-tiket-pengaduan tanpa nomor');
    return data.nomorTiket;
  }

  async simpanTidakLengkap({ percakapanId, namaProduk, kronologi, namaPelapor, nomorTelepon }) {
    await this.panggil('simpan-pengaduan-tidak-lengkap', { percakapanId, namaProduk, kronologi, namaPelapor, nomorTelepon });
  }
}

/** Tiruan di memori untuk pengembangan lokal dan tes. Satu percakapan satu tiket, seperti basis data. */
export class GerbangPengaduanTiruan {
  constructor(now = () => new Date()) {
    this.now = now;
    this.urutan = new Map();
    this.tiketPerPercakapan = new Map();
    this.tidakLengkap = new Map();
  }

  async terbitkanTiket({ percakapanId, namaProduk, kronologi, namaPelapor, nomorTelepon }) {
    if (!namaProduk || !kronologi || !namaPelapor || !nomorTelepon) throw new Error('data pengaduan tidak lengkap');
    const ada = this.tiketPerPercakapan.get(percakapanId);
    if (ada) return ada;
    const tanggal = this.now().toISOString().slice(0, 10).replaceAll('-', '');
    const n = (this.urutan.get(tanggal) ?? 0) + 1;
    this.urutan.set(tanggal, n);
    const nomor = `ADU-${tanggal}-${String(n).padStart(4, '0')}`;
    this.tiketPerPercakapan.set(percakapanId, nomor);
    return nomor;
  }

  async simpanTidakLengkap(data) {
    this.tidakLengkap.set(data.percakapanId, { ...data, status: 'pengaduan_tidak_lengkap' });
  }
}

/** Pengirim SMS tiruan: hanya mencatat di memori, tidak mengirim apa pun dan tidak menulis nomor ke log. */
export class PengirimSmsTiruan {
  constructor() {
    this.terkirim = [];
  }

  async kirim(nomorTelepon, teks) {
    this.terkirim.push({ nomorTelepon, teks });
    if (this.terkirim.length > 100) this.terkirim.shift();
  }
}
