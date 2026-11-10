// Alamat klien untuk batas per IP, dan origin yang diizinkan mengirim POST.
import { timingSafeEqual } from 'node:crypto';

const samaAman = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const daftar = (s = '') => new Set(s.split(',').map((x) => x.trim()).filter(Boolean));

/**
 * Gateway dicapai lewat Caddy, yang menambahkan alamat klien sebagai entri TERAKHIR X-Forwarded-For; entri sebelumnya
 * bisa dipalsukan klien, jadi tidak dipakai. Dashboard yang di-deploy terpisah (Coolify) meneruskan /voice/* sendiri,
 * sehingga di mata Caddy semua penelepon datang dari IP server dashboard. Dashboard itu mengirim alamat penelepon di
 * X-Sigap-Ip-Klien. Header ini dipakai hanya bila permintaan datang dari salah satu PROXY_IP_TEPERCAYA (entri terakhir
 * X-Forwarded-For), atau bila X-Sigap-Kunci-Proxy sama dengan PROXY_KUNCI.
 */
export function buatIpKlien({ kunciProxy = '', ipTepercaya = '' } = {}) {
  const tepercaya = daftar(ipTepercaya);
  return (req) => {
    const xff = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const sumber = xff.at(-1) ?? req.socket?.remoteAddress ?? '';
    const dariProxy = String(req.headers['x-sigap-ip-klien'] ?? '').trim();
    if (!dariProxy) return sumber;
    if (tepercaya.has(sumber)) return dariProxy;
    const kunci = String(req.headers['x-sigap-kunci-proxy'] ?? '');
    if (kunciProxy && kunci && samaAman(kunci, kunciProxy)) return dariProxy;
    return sumber;
  };
}

/** SITE_ORIGIN boleh berisi beberapa origin dipisah koma (VPS dan Coolify). Kosong berarti origin tidak diperiksa. */
export function buatCekOrigin(siteOrigin = '') {
  const izin = new Set([...daftar(siteOrigin)].map((s) => s.replace(/\/+$/, '')));
  return (origin) => izin.size === 0 || izin.has(String(origin ?? ''));
}
