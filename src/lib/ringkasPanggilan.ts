// Tampilan Kantor Pantau AI Agent (UC-04, F5.4) saat panggilan sangat banyak: browser hanya menerima jumlah per tahap dan
// beberapa contoh panggilan, bukan seluruh daftar, agar halaman yang diperbarui tiap 2 detik tetap ringan.
// ponytail: daftar lengkap masih dibaca dari view panggilan_berjalan lalu diringkas di server; pindahkan hitungan ke RPC
// agregat bila panggilan simultan jauh melewati target NFR-4.

/** Jumlah penelepon contoh yang dikirim ke browser (antrean 4 sprite dan umpan aktivitas). */
export const CONTOH_PANGGILAN = 10;
/** NFR-4: target 50 panggilan simultan. Di atas angka ini Kantor masuk mode ramai. */
export const BATAS_RAMAI = 50;

export type RingkasanPanggilan = { total: number; perTahap: Record<string, number> };

export function ringkasPanggilan<T extends { tahap: string }>(daftar: T[] | null, batas = CONTOH_PANGGILAN) {
  if (!daftar) return { panggilan: null, ringkasan: null };
  const perTahap: Record<string, number> = {};
  for (const p of daftar) perTahap[p.tahap] = (perTahap[p.tahap] ?? 0) + 1;
  return { panggilan: daftar.slice(0, batas), ringkasan: { total: daftar.length, perTahap } satisfies RingkasanPanggilan };
}
