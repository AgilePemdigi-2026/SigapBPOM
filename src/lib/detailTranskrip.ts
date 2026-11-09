// Penyusun halaman Detail Transkrip UC-05 (T-F6.2-02, REQ-5.2 sampai REQ-5.4, NFR-13). Membaca detail lewat
// TranskripController lalu menyiapkan isi TranskripPercakapan dan RingkasanPercakapan. Dengan token sesi Supabase,
// data dibaca memakai token petugas agar is_petugas() berlaku; penyimpanan tiruan hanya untuk jalur tanpa token di
// pengembangan lokal, tidak pernah di build produksi.
import { LABEL_JENIS_INTERAKSI } from './PemantauanLayananController.ts';
import { PESAN_CATATAN_WAJIB_DIISI, PenyimpananTranskripMock, TranskripController, type PenyimpananTranskripPetugas } from './TranskripController.ts';
import { PenyimpananTranskripPetugasSupabase } from './penyimpananTranskripPetugasSupabase.ts';
import { bacaKonfigurasiSupabase } from './konfigurasiSupabase.ts';
import { PESAN_SISTEM } from './sesiSupabase.ts';

/** Kamus pesan PRD-rinci Lampiran A. UC-05 belum punya pesan untuk detail gagal dimuat, jadi dipakai pesan UC-04. */
export const PESAN_DETAIL_TRANSKRIP = { gagalDimuat: 'Data panggilan gagal dimuat.' } as const;

/** Label baku status_penyelesaian (PRD-rinci Bagian 9). */
export const LABEL_STATUS_PENYELESAIAN: Record<string, string> = {
  selesai_ai: 'selesai oleh AI',
  dieskalasi: 'dieskalasi',
  tiket_terbit: 'tiket terbit',
  pengaduan_tidak_lengkap: 'pengaduan tidak lengkap',
};

const LABEL_PEMBICARA = { sistem: 'CS AI', penelepon: 'Penelepon' } as const;
const ZONA = 'Asia/Jakarta';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Nomor telepon Indonesia yang belum tersamar, boleh berpemisah spasi atau tanda hubung (0812-3456-7890, +62812...).
const NOMOR_TELEPON = /(?<![\d*])(?:\+62|62|0)8(?:[\s-]?\d){8,11}(?![\d*])/g;

export type UcapanTampil = { urutan: number; stempel: string; pembicara: (typeof LABEL_PEMBICARA)[keyof typeof LABEL_PEMBICARA]; dariPenelepon: boolean; teks: string };

export type DetailTranskripTampil = { waktu: string; jenis: string; ringkasan: string; labelStatus: string; ucapan: UcapanTampil[] };

/**
 * NFR-13: view ucapan_petugas dan Voice Gateway sudah menyamarkan data pribadi. Nomor telepon yang masih utuh di teks
 * disamarkan lagi di server sebelum halaman dikirim, dengan bentuk "0812****7890" seperti REQ-5.2.
 */
export function samarkanNomorDiTeks(teks: string): string {
  return teks.replace(NOMOR_TELEPON, (cocok) => {
    const angka = cocok.replace(/\D/g, '').replace(/^62/, '0');
    return `${angka.slice(0, 4)}****${angka.slice(-4)}`;
  });
}

/** Stempel waktu ucapan sejak panggilan dimulai, mm:ss. */
export const stempelDetik = (detik: number) => {
  const d = Math.max(0, Math.floor(detik));
  return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
};

const waktuTampil = (iso: string) => {
  const b = Object.fromEntries(
    new Intl.DateTimeFormat('id-ID', { timeZone: ZONA, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${b.day} ${b.month} ${b.year} · ${b.hour}:${b.minute}`;
};

const label = (kamus: Record<string, string>, kunci: string | null) => (kunci && Object.hasOwn(kamus, kunci) ? kamus[kunci] : undefined);

/** REQ-5.2: detail percakapan untuk halaman; percakapan tidak ada memberi 404, penyimpanan gagal memberi 503. */
export async function bacaDetailTranskrip(transkrip: TranskripController, id: unknown): Promise<{ detail: DetailTranskripTampil } | { gagal: string; kode: 404 | 503 }> {
  if (typeof id !== 'string' || !UUID.test(id)) return { gagal: PESAN_DETAIL_TRANSKRIP.gagalDimuat, kode: 404 };
  try {
    const d = await transkrip.ambilDetailTranskrip(id);
    if (!d) return { gagal: PESAN_DETAIL_TRANSKRIP.gagalDimuat, kode: 404 };
    const p = d.percakapan;
    return {
      detail: {
        waktu: waktuTampil(p.waktuMulai),
        jenis: label(LABEL_JENIS_INTERAKSI, p.jenisInteraksi) ?? '—',
        ringkasan: p.ringkasan?.trim() || '—',
        labelStatus: label(LABEL_STATUS_PENYELESAIAN, p.statusPenyelesaian) ?? p.statusPenyelesaian,
        ucapan: [...d.ucapan]
          .sort((a, b) => a.urutan - b.urutan)
          .map((u) => ({
            urutan: u.urutan,
            stempel: stempelDetik(u.detikKe),
            pembicara: LABEL_PEMBICARA[u.pembicara],
            dariPenelepon: u.pembicara === 'penelepon',
            teks: samarkanNomorDiTeks(u.teks),
          })),
      },
    };
  } catch {
    return { gagal: PESAN_DETAIL_TRANSKRIP.gagalDimuat, kode: 503 };
  }
}

/** REQ-5.3, REQ-5.4: simpan catatan pemeriksaan. Galat selain catatan kosong tidak diteruskan apa adanya (PROJECT_RULES 5.12). */
export async function simpanCatatan(transkrip: TranskripController, id: unknown, catatan: unknown): Promise<{ berhasil: boolean; pesan: string }> {
  if (typeof id !== 'string' || !UUID.test(id)) return { berhasil: false, pesan: PESAN_SISTEM };
  try {
    const hasil = await transkrip.simpanCatatanPemeriksaan(id, typeof catatan === 'string' ? catatan : '');
    return { berhasil: true, pesan: hasil.pesan };
  } catch (e) {
    return { berhasil: false, pesan: e instanceof Error && e.message === PESAN_CATATAN_WAJIB_DIISI ? PESAN_CATATAN_WAJIB_DIISI : PESAN_SISTEM };
  }
}

// Satu instance tiruan per proses agar catatan yang disimpan di pengembangan lokal terbaca lagi setelah halaman dimuat ulang.
const tiruan = new PenyimpananTranskripMock();

export function pilihPenyimpananTranskrip(
  tokenAkses: string | undefined,
  env: Record<string, string | undefined> = process.env,
  produksi: boolean = import.meta.env.PROD,
): PenyimpananTranskripPetugas {
  if (!tokenAkses && !produksi) return tiruan;
  const konfigurasi = bacaKonfigurasiSupabase(env);
  return new PenyimpananTranskripPetugasSupabase({ url: konfigurasi?.url ?? '', kunciPublik: konfigurasi?.kunciAnon ?? '', tokenAkses: tokenAkses ?? '' });
}

export const transkripPetugas = (tokenAkses: string | undefined) => new TranskripController(pilihPenyimpananTranskrip(tokenAkses));
