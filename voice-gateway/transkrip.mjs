// Control UC-01 register layanan (T-F1.1-03, T-F1.1-05, NFR-20, T-F5.4-01): gateway mencatat transkrip percakapan (ucapan
// penelepon dan jawaban agen) serta pemanggilan tool yang dijalankannya sendiri. Urutan dan detik ke- dihitung basis data,
// nomor telepon disamarkan Edge Function. Pencatatan tidak pernah menahan atau menggagalkan giliran penelepon.

/** Pembicara ucapan. Salinan PEMBICARA di supabase/functions/_shared/entity/ucapan.ts dan enum public.pembicara: ubah bersama. */
export const PEMBICARA = Object.freeze({ SISTEM: 'sistem', PENELEPON: 'penelepon' });

/**
 * Interface pengirim: `kirim(body)` dengan body `{ aksi: 'ucapan', percakapanId, pembicara, teks }`,
 * `{ aksi: 'tool', percakapanId, namaTool, durasiMs, berhasil }`, atau `{ aksi: 'ringkasan', percakapanId, ringkasan }`
 * (ringkasan.mjs). Tiruan menyimpan di memori seperti tabel ucapan, log_tool, dan kolom percakapan.ringkasan.
 */
export class PengirimTranskripTiruan {
  constructor(maks = 200) {
    this.maks = maks;
    this.percakapan = new Map();
  }

  async kirim({ aksi, percakapanId, ...isi }) {
    let p = this.percakapan.get(percakapanId);
    if (!p) {
      if (this.percakapan.size >= this.maks) this.percakapan.delete(this.percakapan.keys().next().value);
      p = { ucapan: [], tool: [] };
      this.percakapan.set(percakapanId, p);
    }
    if (aksi === 'ucapan') p.ucapan.push({ urutan: p.ucapan.length + 1, ...isi });
    else if (aksi === 'ringkasan') p.ringkasan = isi.ringkasan;
    else p.tool.push(isi);
  }
}

/** Implementasi lewat Edge Function `catat-percakapan`, dengan kunci internal bersama (bukan service_role). */
export class PengirimTranskripSupabase {
  constructor(url, kunci) {
    this.url = url.replace(/\/$/, '');
    this.kunci = kunci;
  }

  async kirim(body) {
    const r = await fetch(`${this.url}/functions/v1/catat-percakapan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sigap-kunci': this.kunci },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) throw new Error(`transkrip ${r.status}`);
  }
}

/**
 * Antrean pencatatan per panggilan. Baris percakapan dibuat oleh laporan panggilan aktif pertama (panggilanAktif.mjs), jadi
 * catatan ditahan sampai `tercatat(id)` dipanggil, lalu dikirim satu per satu sesuai urutan kejadian. Galat pengirim hanya
 * diteruskan ke `onGalat`. Jumlah panggilan dan catatan tertahan dibatasi agar memori gateway publik tidak bisa dibanjiri.
 */
export class PencatatTranskrip {
  constructor({ pengirim, onGalat = () => {}, maks = 200, antreanMaks = 50 }) {
    this.pengirim = pengirim;
    this.onGalat = onGalat;
    this.batas = { maks, antreanMaks };
    this.sesi = new Map();
  }

  /** Baris percakapan sudah ada (laporan panggilan aktif berhasil). Aman dipanggil berulang, mis. tiap heartbeat. */
  tercatat(id) {
    const s = this.ambil(id);
    if (!s) return;
    s.tercatat = true;
    this.alirkan(id, s);
  }

  /** Satu giliran: ucapan penelepon (bila ada) lalu jawaban agen yang disampaikan kepadanya. */
  giliran(id, ucapan, jawaban) {
    if (ucapan) this.tambah(id, { aksi: 'ucapan', pembicara: PEMBICARA.PENELEPON, teks: ucapan });
    if (jawaban) this.tambah(id, { aksi: 'ucapan', pembicara: PEMBICARA.SISTEM, teks: jawaban });
  }

  /** Pemanggilan tool: hanya nama, durasi, dan berhasil tidaknya, tanpa argumen maupun hasil. */
  tool(id, namaTool, durasiMs, berhasil) {
    this.tambah(id, { aksi: 'tool', namaTool, durasiMs: Math.max(0, Math.round(durasiMs)), berhasil: Boolean(berhasil) });
  }

  /** Panggilan berakhir: catatan yang sedang dikirim diselesaikan dulu. Catatan tanpa baris percakapan dibuang. */
  akhiri(id) {
    const s = this.sesi.get(id);
    if (!s) return;
    if (s.jalan) s.berakhir = true;
    else this.sesi.delete(id);
  }

  ambil(id) {
    let s = this.sesi.get(id);
    if (s) return s;
    if (this.sesi.size >= this.batas.maks) {
      // Penuh: geser dulu sesi tertua yang laporan panggilan aktifnya belum sampai, baru sesi tercatat yang tidak sedang
      // mengirim, biasanya panggilan yang ditinggalkan tanpa akhiri.
      const semua = [...this.sesi];
      const korban = (semua.find(([, v]) => !v.tercatat) ?? semua.find(([, v]) => !v.jalan))?.[0];
      if (korban === undefined) return null;
      this.sesi.delete(korban);
    }
    s = { tercatat: false, antrean: [], jalan: false, berakhir: false };
    this.sesi.set(id, s);
    return s;
  }

  tambah(id, catatan) {
    const s = this.ambil(id);
    if (!s || s.antrean.length >= this.batas.antreanMaks) return this.onGalat(new Error('antrean transkrip penuh'));
    s.antrean.push(catatan);
    if (s.tercatat) this.alirkan(id, s);
  }

  async alirkan(id, s) {
    if (s.jalan) return;
    s.jalan = true;
    while (s.antrean.length) {
      const catatan = s.antrean.shift();
      try {
        await this.pengirim.kirim({ percakapanId: id, ...catatan });
      } catch (e) {
        this.onGalat(e);
      }
    }
    // Tanda jalan dilepas tanpa jeda setelah antrean kosong, jadi catatan baru selalu memicu pengiriman lagi.
    s.jalan = false;
    if (s.berakhir && this.sesi.get(id) === s) this.sesi.delete(id);
  }
}
