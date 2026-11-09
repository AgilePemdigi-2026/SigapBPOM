// Penyusun endpoint penanganan UC-06 (T-F7.2-03, REQ-6.1 sampai REQ-6.6, BR-2, BR-3). Memvalidasi isian dari dashboard,
// menjalankan PenangananController, lalu memetakan hasil dan galat RPC ke kode HTTP dan pesan kamus (PROJECT_RULES 4.4).
// Mesin status ditegakkan RPC. Dengan token sesi Supabase, RPC dipanggil memakai token petugas; penyimpanan tiruan hanya
// untuk jalur tanpa token di pengembangan lokal, tidak pernah di build produksi.
import { OPSI_TINDAK_LANJUT, PESAN_TUTUP_TANPA_TANGGAPAN, PenangananController, PenyimpananPenangananMock, type PenyimpananPenanganan, type TindakLanjut } from './PenangananController.ts';
import { LABEL_STATUS_TIKET, type StatusTiket } from './PemantauanLayananController.ts';
import { penyimpananPenangananSupabase } from './penyimpananPenangananSupabase.ts';
import { bacaKonfigurasiSupabase } from './konfigurasiSupabase.ts';
import { PESAN_SISTEM } from './sesiSupabase.ts';

// Kamus UC-06 belum punya pesan untuk isian tidak sah, akses, dan transisi yang ditolak; dipakai pesan yang sama dengan
// endpoint simpan-materi dan middleware. "Tiket tidak ditemukan." dari kamus UC-04.
const PESAN_TIDAK_VALID = 'Permintaan tidak valid.';

export type DataPenanganan = { noTiket: string; status: StatusTiket | null; labelStatus: string | null };

/** `kode` adalah kode HTTP (PROJECT_RULES 4.4). */
export type HasilPenanganan = { kode: 200 | 400 | 403 | 404 | 422 | 500; pesan: string; data: DataPenanganan | null };

type Penolakan = Pick<HasilPenanganan, 'kode' | 'pesan'>;

// SQLSTATE yang dilempar RPC UC-06 (migrasi 20261104120000 dan 20261105130000). 55000 dan SG409 menandai transisi status
// yang ditolak (BR-3, tiket diteruskan atau selesai). Galat lain, termasuk PGRST202 saat RPC belum dimigrasikan, menjadi
// galat sistem.
const PENOLAKAN: Record<string, Penolakan> = {
  '22023': { kode: 400, pesan: PESAN_TIDAK_VALID },
  '42501': { kode: 403, pesan: 'Akses ditolak.' },
  P0002: { kode: 404, pesan: 'Tiket tidak ditemukan.' },
  '55000': { kode: 422, pesan: PESAN_TIDAK_VALID },
  SG409: { kode: 422, pesan: PESAN_TIDAK_VALID },
  SGBR2: { kode: 422, pesan: PESAN_TUTUP_TANPA_TANGGAPAN },
};

const DITOLAK: HasilPenanganan = { kode: 400, pesan: PESAN_TIDAK_VALID, data: null };

// Sama dengan check constraint tiket.no_tiket (migrasi inti_percakapan).
const POLA_NO_TIKET = /^(ADU|ESK)-\d{8}-\d{4}$/;
// PROJECT_RULES 5.6: panjang isian dibatasi sama dengan RPC sebelum diteruskan ke basis data.
const PANJANG_CATATAN_MAKS = 2000;
const PANJANG_UNIT_MAKS = 200;
const PANJANG_TANGGAPAN_MAKS = 5000;

const noTiketSah = (v: unknown): v is string => typeof v === 'string' && POLA_NO_TIKET.test(v);
const tindakLanjutSah = (v: unknown): v is TindakLanjut => typeof v === 'string' && OPSI_TINDAK_LANJUT.includes(v as TindakLanjut);

/** Teks terpangkas, atau null bila bukan teks, kosong padahal `wajib`, atau terlalu panjang. Nilai tidak ada dianggap kosong. */
function teks(nilai: unknown, panjangMaks: number, wajib: boolean): string | null {
  const v = nilai ?? '';
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return (wajib && !t) || t.length > panjangMaks ? null : t;
}

/** Tanggal kalender YYYY-MM-DD (nilai <input type="date">), atau null bila tidak sah, misalnya 2026-02-30. */
function tanggal(nilai: unknown): string | null {
  if (typeof nilai !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(nilai)) return null;
  const d = new Date(`${nilai}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(nilai) ? nilai : null;
}

async function jalankan(noTiket: string, aksi: () => Promise<{ status: string; pesan: string }>): Promise<HasilPenanganan> {
  try {
    const hasil = await aksi();
    const status = Object.hasOwn(LABEL_STATUS_TIKET, hasil.status) ? (hasil.status as StatusTiket) : null;
    return { kode: 200, pesan: hasil.pesan, data: { noTiket, status, labelStatus: status && LABEL_STATUS_TIKET[status] } };
  } catch (e) {
    const galat = e as { code?: string; message?: string } | null;
    // Penyimpanan tiruan melempar Error berisi pesan kamus BR-2 tanpa SQLSTATE.
    const kode = galat?.code ?? (galat?.message === PESAN_TUTUP_TANPA_TANGGAPAN ? 'SGBR2' : '');
    return { ...(Object.hasOwn(PENOLAKAN, kode) ? PENOLAKAN[kode] : { kode: 500, pesan: PESAN_SISTEM }), data: null };
  }
}

/** REQ-6.1, REQ-6.2, BR-3: "Bukan Kewenangan BPOM" meneruskan pengaduan dan menghentikan penanganannya. */
export async function simpanTelaah(penanganan: PenangananController, noTiket: unknown, tindakLanjut: unknown, catatan: unknown): Promise<HasilPenanganan> {
  const c = teks(catatan, PANJANG_CATATAN_MAKS, false);
  if (!noTiketSah(noTiket) || !tindakLanjutSah(tindakLanjut) || c === null) return DITOLAK;
  return jalankan(noTiket, () => penanganan.simpanTelaah(noTiket, tindakLanjut, c));
}

/** REQ-6.3: jadwal pemeriksaan lapangan membuat tiket berstatus Menunggu Pemeriksaan. */
export async function simpanJadwal(penanganan: PenangananController, noTiket: unknown, tanggalPemeriksaan: unknown, unitPelaksana: unknown): Promise<HasilPenanganan> {
  const tgl = tanggal(tanggalPemeriksaan);
  const unit = teks(unitPelaksana, PANJANG_UNIT_MAKS, true);
  if (!noTiketSah(noTiket) || tgl === null || unit === null) return DITOLAK;
  return jalankan(noTiket, () => penanganan.simpanJadwalPemeriksaan(noTiket, tgl, unit));
}

/** REQ-6.4: tanggapan resmi kosong ditolak, karena tanggapan adalah syarat penutupan tiket (BR-2). */
export async function simpanTanggapan(penanganan: PenangananController, noTiket: unknown, isi: unknown): Promise<HasilPenanganan> {
  const tanggapan = teks(isi, PANJANG_TANGGAPAN_MAKS, true);
  if (!noTiketSah(noTiket) || tanggapan === null) return DITOLAK;
  return jalankan(noTiket, () => penanganan.simpanTanggapan(noTiket, tanggapan));
}

/** REQ-6.5, REQ-6.6, BR-2: tiket tanpa tanggapan ditolak; SMS dikirim dari notifikasi yang diantrekan RPC (T-F7.3-01). */
export async function tutupTiket(penanganan: PenangananController, noTiket: unknown): Promise<HasilPenanganan> {
  if (!noTiketSah(noTiket)) return DITOLAK;
  return jalankan(noTiket, () => penanganan.tutupTiket(noTiket));
}

/** Respons JSON endpoint dashboard `{ status, message, data }`. */
export const respons = (hasil: HasilPenanganan) =>
  Response.json({ status: hasil.kode === 200 ? 'success' : 'error', message: hasil.pesan, data: hasil.data }, { status: hasil.kode });

// Satu instance tiruan per proses agar status tiket bertahan di antara permintaan sampai server dimulai ulang.
const tiruan = new PenyimpananPenangananMock();

export function pilihPenyimpananPenanganan(tokenAkses: string | undefined, env: Record<string, string | undefined> = process.env, produksi?: boolean): PenyimpananPenanganan {
  // import.meta.env hanya dibaca bila tanpa token, agar endpoint tetap bisa diuji langsung di Node.
  if (!tokenAkses && !(produksi ?? import.meta.env.PROD)) return tiruan;
  const konfigurasi = bacaKonfigurasiSupabase(env);
  return penyimpananPenangananSupabase({ url: konfigurasi?.url ?? '', kunciPublik: konfigurasi?.kunciAnon ?? '', tokenAkses: tokenAkses ?? '' });
}

export const penangananPetugas = (tokenAkses: string | undefined) => new PenangananController(pilihPenyimpananPenanganan(tokenAkses));
