// Deteksi suara lokal panel (rekam lalu unggah): ambang mengikuti bising ruangan, supaya kipas, AC, atau keramaian
// tidak memicu rekaman. Kalibrasi: naikkan KALI_LANTAI bila suara luar masih memicu, turunkan bila ucapan pelan terlewat.

export const AMBANG_MIN = 0.025;
export const AMBANG_MAKS = 0.08;
export const KALI_LANTAI = 3;

/**
 * Satu cuplikan RMS (tiap 100 ms) -> apakah penelepon bicara, dan taksiran bising ruangan (`lantai`) terbaru.
 * Lantai hanya diperbarui saat hening sebelum ucapan dimulai, jadi jeda di tengah kalimat tidak menaikkannya.
 */
export function ambangSuara(lantai: number, rms: number, sedangBicara: boolean) {
  const ambang = Math.min(AMBANG_MAKS, Math.max(AMBANG_MIN, lantai * KALI_LANTAI));
  const bicara = rms > ambang;
  if (bicara || sedangBicara) return { bicara, lantai };
  return { bicara, lantai: lantai ? lantai * 0.9 + rms * 0.1 : rms };
}
