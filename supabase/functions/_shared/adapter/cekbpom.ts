// Adapter cekbpom (PROJECT_RULES 4.3): satu interface, implementasi tiruan dan resmi (T-F1.2-02).
import type { Produk, StatusIzin } from '../entity/produk.ts';
import produkTiruan from './produkTiruan.json' with { type: 'json' };

export interface AdapterCekBpom {
  cari(namaProduk: string, signal: AbortSignal): Promise<Produk[]>;
}

/** Dataset contoh selama akses resmi cekbpom.pom.go.id belum tersedia (PRD asumsi). */
export class AdapterCekBpomTiruan implements AdapterCekBpom {
  async cari(namaProduk: string): Promise<Produk[]> {
    const kunci = namaProduk.toLowerCase();
    return (produkTiruan as Produk[]).filter((p) => p.nama.toLowerCase().includes(kunci));
  }
}

interface ItemCache {
  hasil: Produk[];
  kedaluwarsa: number;
}

interface SesiBpom {
  cookie: string;
  csrfToken: string;
  kedaluwarsa: number;
}

/** TTL cache pencarian produk dalam milidetik (180 detik / 3 menit) untuk mendukung NFR-4 (50 panggilan serentak). */
export const TTL_CACHE_PRODUK_MS = 180 * 1000;

/** TTL sesi CSRF dalam milidetik (30 menit). */
const TTL_SESI_MS = 30 * 60 * 1000;

const USER_AGENT_BAWAAN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SigapBPOM/1.0';

const cacheProdukGlobal = new Map<string, ItemCache>();
const inFlightGlobal = new Map<string, Promise<Produk[]>>();
let sesiBpomGlobal: SesiBpom | null = null;

function normalkanStatusIzin(status: unknown): StatusIzin {
  if (typeof status === 'string') {
    const s = status.trim().toLowerCase();
    if (s.includes('batal')) return 'Dibatalkan';
    if (s.includes('tidak') || s.includes('habis') || s.includes('kadaluarsa') || s.includes('expired')) {
      return 'Tidak Berlaku';
    }
    if (s.includes('berlaku')) return 'Berlaku';
  }
  return 'Berlaku';
}

function bersihkanTeks(teks: unknown): string {
  if (typeof teks !== 'string') return '';
  return teks
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function ekstrakCookie(headers: Headers): string {
  if (typeof (headers as any).getSetCookie === 'function') {
    const cookies = (headers as any).getSetCookie() as string[];
    if (Array.isArray(cookies) && cookies.length > 0) {
      return cookies.map((c) => c.split(';')[0]).join('; ');
    }
  }
  const raw = headers.get('set-cookie') || '';
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.trim().split(';')[0])
    .filter(Boolean)
    .join('; ');
}

async function dapatkanSesi(baseUrl: string, signal?: AbortSignal): Promise<{ cookie: string; csrfToken: string }> {
  if (sesiBpomGlobal && Date.now() < sesiBpomGlobal.kedaluwarsa) {
    return { cookie: sesiBpomGlobal.cookie, csrfToken: sesiBpomGlobal.csrfToken };
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/all-produk`;
  const res = await fetch(url, {
    signal,
    headers: {
      'User-Agent': USER_AGENT_BAWAAN,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(`Gagal membuka antarmuka cekbpom (${res.status})`);
  }

  const cookie = ekstrakCookie(res.headers);
  const html = await res.text();
  const csrfMatch =
    html.match(/csrf-token["']?\s+content=["']([^"']+)/i) ||
    html.match(/content=["']([^"']+)["']\s+name=["']csrf-token/i);
  const csrfToken = csrfMatch ? csrfMatch[1] : '';

  if (!csrfToken) {
    throw new Error('Token CSRF cekbpom tidak ditemukan');
  }

  sesiBpomGlobal = { cookie, csrfToken, kedaluwarsa: Date.now() + TTL_SESI_MS };
  return { cookie, csrfToken };
}

/**
 * Implementasi adapter resmi cekbpom (issue #29, T-F1.2-02, REQ-1.3).
 * Mengambil data registrasi dari antarmuka publik https://cekbpom.pom.go.id
 * dengan mematuhi AbortSignal controller (NFR-2) dan dilengkapi in-memory cache (NFR-4).
 */
export class AdapterCekBpomResmi implements AdapterCekBpom {
  baseUrl: string;
  ttlMs: number;

  constructor(baseUrl?: string, ttlMs = TTL_CACHE_PRODUK_MS) {
    this.baseUrl =
      baseUrl ||
      (typeof Deno !== 'undefined' ? Deno.env.get('CEKBPOM_BASE_URL') : undefined) ||
      (typeof process !== 'undefined' && process.env ? process.env.CEKBPOM_BASE_URL : undefined) ||
      'https://cekbpom.pom.go.id';
    this.ttlMs = ttlMs;
  }

  async cari(namaProduk: string, signal?: AbortSignal): Promise<Produk[]> {
    if (signal?.aborted) {
      throw signal.reason || new Error('Pencarian dibatalkan');
    }

    const kunci = namaProduk.trim();
    if (!kunci) return [];

    const cacheKey = kunci.toLowerCase();

    // 1. Cek cache in-memory (NFR-4)
    const hit = cacheProdukGlobal.get(cacheKey);
    if (hit && Date.now() < hit.kedaluwarsa) {
      return hit.hasil;
    }

    // 2. Coalescing: jika panggilan serentak untuk query yang sama sedang berjalan, gabungkan promise
    const sedangBerjalan = inFlightGlobal.get(cacheKey);
    if (sedangBerjalan) {
      return sedangBerjalan;
    }

    const proses = (async () => {
      try {
        return await this.kirimPencarian(kunci, signal);
      } finally {
        inFlightGlobal.delete(cacheKey);
      }
    })();

    inFlightGlobal.set(cacheKey, proses);
    const hasil = await proses;

    // Simpan ke cache jika sukses
    cacheProdukGlobal.set(cacheKey, { hasil, kedaluwarsa: Date.now() + this.ttlMs });

    // Bersihkan entri kedaluwarsa secara berkala agar tidak memenuhi memori
    if (cacheProdukGlobal.size > 1000) {
      const sekarang = Date.now();
      for (const [k, v] of cacheProdukGlobal.entries()) {
        if (v.kedaluwarsa <= sekarang) cacheProdukGlobal.delete(k);
      }
    }

    return hasil;
  }

  private async kirimPencarian(kunci: string, signal?: AbortSignal, ulangi = true): Promise<Produk[]> {
    const { cookie, csrfToken } = await dapatkanSesi(this.baseUrl, signal);
    const endpoint = `${this.baseUrl.replace(/\/+$/, '')}/produk-dt/all`;

    const body = new URLSearchParams({
      draw: '1',
      start: '0',
      length: '20',
      'search[value]': '',
      'search[regex]': 'false',
      product_name: kunci,
      product_register: '',
      product_brand: '',
      product_package: '',
      product_form: '',
      ingredients: '',
      submit_date_start: '',
      submit_date_end: '',
      product_date_start: '',
      product_date_end: '',
      expire_date_start: '',
      expire_date_end: '',
      manufacturer_name: '',
      status: '',
      release_date: '',
      query: '',
      manufacturer: '',
      registrar: '',
    });

    const res = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        'User-Agent': USER_AGENT_BAWAAN,
        'X-CSRF-TOKEN': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${this.baseUrl.replace(/\/+$/, '')}/all-produk`,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        ...(cookie ? { 'Cookie': cookie } : {}),
      },
      body: body.toString(),
    });

    // Jika token CSRF/sesi kedaluwarsa (HTTP 419), muat ulang sesi sekali lagi
    if (res.status === 419 && ulangi) {
      sesiBpomGlobal = null;
      return this.kirimPencarian(kunci, signal, false);
    }

    if (!res.ok) {
      throw new Error(`Server BPOM merespons status ${res.status}`);
    }

    const json = await res.json();
    const dataList = Array.isArray(json?.data) ? json.data : [];

    return dataList.map((row: any): Produk => ({
      nama: bersihkanTeks(row.PRODUCT_NAME || row.PRODUCT_BRANDS || kunci),
      nomorIzinEdar: bersihkanTeks(row.PRODUCT_REGISTER || ''),
      status: normalkanStatusIzin(row.STATUS),
      pendaftar: bersihkanTeks(row.REGISTRAR || row.MANUFACTURER_NAME || ''),
      sumber: 'cekbpom.pom.go.id',
    }));
  }
}

/** Helper untuk keperluan pengujian: mereset cache dan sesi in-memory. */
export function resetCacheCekBpom(): void {
  cacheProdukGlobal.clear();
  inFlightGlobal.clear();
  sesiBpomGlobal = null;
}

export function buatAdapterCekBpom(mode: string | undefined): AdapterCekBpom {
  const envMode = typeof Deno !== 'undefined'
    ? (Deno.env.get('CEKBPOM_ADAPTER') ?? Deno.env.get('CEKBPM_ADAPTER'))
    : (typeof process !== 'undefined' && process.env
        ? (process.env.CEKBPOM_ADAPTER ?? process.env.CEKBPM_ADAPTER)
        : undefined);
  const pilihan = (mode && mode.trim()) ? mode : envMode;
  return pilihan === 'resmi' ? new AdapterCekBpomResmi() : new AdapterCekBpomTiruan();
}
