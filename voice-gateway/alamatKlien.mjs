// Alamat klien untuk batas per IP, dan origin yang diizinkan mengirim POST.
import { timingSafeEqual } from 'node:crypto';

const samaAman = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Gateway dicapai lewat Caddy, yang menambahkan alamat klien sebagai entri TERAKHIR X-Forwarded-For; entri sebelumnya
 * bisa dipalsukan klien, jadi tidak dipakai. Dashboard yang di-deploy terpisah (Coolify) meneruskan /voice/* sendiri,
 * sehingga di mata Caddy semua penelepon datang dari IP server dashboard. Dashboard itu mengirim alamat penelepon di
 * X-Sigap-Ip-Klien bersama X-Sigap-Kunci-Proxy; header ini hanya dipakai bila kuncinya sama dengan PROXY_KUNCI.
 */
export function buatIpKlien(kunciProxy = '') {
  return (req) => {
    const kunci = String(req.headers['x-sigap-kunci-proxy'] ?? '');
    const dariProxy = String(req.headers['x-sigap-ip-klien'] ?? '').trim();
    if (kunciProxy && kunci && dariProxy && samaAman(kunci, kunciProxy)) return dariProxy;
    const xff = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return xff.at(-1) ?? req.socket?.remoteAddress ?? '';
  };
}

/** SITE_ORIGIN boleh berisi beberapa origin dipisah koma (VPS dan Coolify). Kosong berarti origin tidak diperiksa. */
export function buatCekOrigin(siteOrigin = '') {
  const daftar = new Set(siteOrigin.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean));
  return (origin) => daftar.size === 0 || daftar.has(String(origin ?? ''));
}
