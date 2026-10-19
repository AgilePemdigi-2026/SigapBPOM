// Data tiruan kartu "Beban Panggilan" dan "Kinerja AI" di Ringkasan Layanan,
// porting dari loadVals() prototipe Claude Design. Diganti agregasi tabel percakapan di Sprint 2 (F5.1).

export type Periode = 'harian' | 'mingguan' | 'bulanan';
type Titik = { bg: string; sh: string };
type Kolom = { tip: string; dots: Titik[] };
export type Beban = {
  total: string; delta: string; sub: string; peak: string; unit: number;
  groups: { n: number; label: string; cols: Kolom[] }[];
  axis: { v: string; bottom: string }[];
  pct: string; deg: string; ai: string; esk: string; aiW: string; eskW: string;
};

const fmt = (n: number) => n.toLocaleString('id-ID');
const pad = (n: number) => String(n).padStart(2, '0');

// Bagi `total` secara proporsional ke `arr`, sisa pembulatan masuk ke nilai terbesar.
function norm(arr: number[], total: number) {
  const s = arr.reduce((x, y) => x + y, 0) || 1;
  const out = arr.map((x) => Math.round((x / s) * total));
  out[out.indexOf(Math.max(...out))] += total - out.reduce((x, y) => x + y, 0);
  return out;
}

export function beban(periode: Periode): Beban {
  const groups: Beban['groups'] = [];
  let unit = 1, total = 0, esk = 0, delta = '', sub = '', peak = '';

  const col = (val: number | null, e: number, tip: string): Kolom => {
    if (val == null) return { tip, dots: [{ bg: '#dfe2e7', sh: 'none' }] };
    const n = val > 0 ? Math.max(1, Math.round(val / unit)) : 0;
    const ne = Math.min(n, e / unit >= 0.4 ? Math.max(1, Math.round(e / unit)) : 0);
    return {
      tip,
      dots: Array.from({ length: n }, (_, i) => (i >= n - ne
        ? { bg: '#f5b70f', sh: '0 2px 6px rgba(245,183,15,.4)' }
        : { bg: '#3b74f6', sh: '0 2px 6px rgba(47,107,245,.28)' })),
    };
  };

  if (periode === 'harian') {
    unit = 3; total = 128; esk = 9; delta = '+12%'; sub = 'Panggilan masuk hari ini per jam · Rabu, 8 Oktober 2026';
    const v = [1, 0, 0, 1, 2, 5, 10, 17, 26, 34, 32], e = [0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 2];
    for (let g = 0; g < 8; g++) {
      groups.push({ n: 3, label: pad(g * 3) + ':00', cols: [0, 1, 2].map((k) => {
        const h = g * 3 + k;
        return h <= 10
          ? col(v[h], e[h], `${pad(h)}:00–${pad(h + 1)}:00 · ${v[h]} panggilan · ${e[h]} dieskalasi`)
          : col(null, 0, `${pad(h)}:00 · belum berlangsung`);
      }) });
    }
    peak = '09:00–10:00 · 34 panggilan';
  } else if (periode === 'mingguan') {
    unit = 5; total = 908; esk = 61; delta = '+6,2%'; sub = 'Panggilan masuk yang ditangani AI dan petugas · 1–7 Oktober 2026';
    const DAYS = ['Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu', 'Senin', 'Selasa'], DF = [0.95, 1.05, 0.9, 0.62, 0.55, 1.18, 1.1], PF = [0.08, 0.35, 1, 0.85, 0.6, 0.25];
    const raw: number[] = [];
    DF.forEach((df, d) => PF.forEach((pf, s) => raw.push(pf * df * (1 + 0.14 * Math.sin((d * 6 + s) * 2.3)))));
    const vals = norm(raw, total), es = norm(raw.map((x) => x * x), esk);
    const best = vals.indexOf(Math.max(...vals));
    DAYS.forEach((dn, d) => groups.push({ n: 6, label: dn, cols: PF.map((_, s) => {
      const i = d * 6 + s;
      return col(vals[i], es[i], `${dn} ${d + 1} Okt · ${pad(s * 4)}:00–${pad(s * 4 + 4)}:00 · ${vals[i]} panggilan · ${es[i]} dieskalasi`);
    }) }));
    peak = `${DAYS[Math.floor(best / 6)]}, ${pad((best % 6) * 4)}:00–${pad((best % 6) * 4 + 4)}:00`;
  } else {
    unit = 15; delta = '+9,1%'; sub = 'Panggilan masuk per hari · September 2026';
    const DOW = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'], WT = [812, 905, 876, 958, 268], WE = [41, 47, 39, 52, 13];
    total = WT.reduce((x, y) => x + y, 0); esk = WE.reduce((x, y) => x + y, 0);
    let best = { v: 0, label: '' };
    WT.forEach((wt, w) => {
      const days = Array.from({ length: w === 4 ? 2 : 7 }, (_, k) => w * 7 + k + 1);
      const raw = days.map((dd) => ((dd - 1) % 7 >= 5 ? 0.62 : 1) * (1 + 0.16 * Math.sin(dd * 1.9)));
      const vals = norm(raw, wt), es = norm(raw.map((x) => x * x), WE[w]);
      days.forEach((dd, k) => { if (vals[k] > best.v) best = { v: vals[k], label: `${DOW[(dd - 1) % 7]}, ${dd} September` }; });
      groups.push({ n: days.length, label: `Minggu ${w + 1}`, cols: days.map((dd, k) => col(vals[k], es[k], `${DOW[(dd - 1) % 7]}, ${dd} Sep · ${vals[k]} panggilan · ${es[k]} dieskalasi`)) });
    });
    peak = `${best.label} · ${best.v} panggilan`;
  }

  const ai = total - esk, pctN = (ai / total) * 100;
  const banding = periode === 'harian' ? 'kemarin' : periode === 'mingguan' ? 'minggu lalu' : 'Agustus';
  return {
    total: fmt(total), delta: `${delta} dibanding ${banding}`, sub, peak, unit, groups,
    axis: [0, 4, 8, 12].map((r) => ({ v: fmt(r * unit), bottom: (r === 0 ? 6 : r * 19 - 7 + 6) + 'px' })),
    pct: pctN.toFixed(1).replace('.', ','), deg: (pctN * 3.6).toFixed(1) + 'deg',
    ai: fmt(ai), esk: fmt(esk), aiW: pctN + '%', eskW: 100 - pctN + '%',
  };
}
