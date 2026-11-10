// Proxy /voice/* ke Voice Gateway untuk deployment yang dashboard-nya tidak berbagi Caddy dengan gateway (Coolify,
// sementara gateway tetap di VPS). Di VPS, Caddy yang meneruskan /voice/* sehingga route ini tidak terpakai.
// Alamat klien dikirim lewat header X-Sigap-Ip-Klien bersama kunci proxy; gateway hanya memercayainya bila kunci cocok,
// sebab di mata Caddy VPS semua permintaan datang dari IP server dashboard.

export const HEADER_IP_KLIEN = 'x-sigap-ip-klien';
export const HEADER_KUNCI_PROXY = 'x-sigap-kunci-proxy';

// Header permintaan browser yang diteruskan. Selebihnya (cookie sesi petugas, header proxy) tidak dikirim ke gateway.
const HEADER_MASUK = ['content-type', 'accept', 'origin', 'range'];
// Header balasan yang tidak boleh diteruskan apa adanya: hop-by-hop, dan panjang/encoding yang sudah diurai fetch.
const HEADER_KELUAR_DIBUANG = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length']);
const BATAS_WAKTU_MS = 120_000;

export interface OpsiProxyVoice {
  /** Akar Voice Gateway, misalnya https://vps.example.id. Path /voice/... ditambahkan apa adanya. */
  gatewayUrl: string;
  ipKlien: string;
  /** Rahasia bersama dengan PROXY_KUNCI di gateway. Kosong berarti alamat klien tidak dikirim. */
  kunciProxy?: string;
  fetch?: typeof fetch;
}

export async function teruskanKeGateway(request: Request, opsi: OpsiProxyVoice): Promise<Response> {
  const asal = new URL(request.url);
  const tujuan = new URL(asal.pathname + asal.search, opsi.gatewayUrl.replace(/\/+$/, '') + '/');
  const headers = new Headers();
  for (const nama of HEADER_MASUK) {
    const nilai = request.headers.get(nama);
    if (nilai) headers.set(nama, nilai);
  }
  if (opsi.kunciProxy) {
    headers.set(HEADER_IP_KLIEN, opsi.ipKlien);
    headers.set(HEADER_KUNCI_PROXY, opsi.kunciProxy);
  }
  const adaBody = request.method !== 'GET' && request.method !== 'HEAD';
  let balasan: Response;
  try {
    balasan = await (opsi.fetch ?? fetch)(tujuan, {
      method: request.method,
      headers,
      body: adaBody ? request.body : undefined,
      // Body streaming (rekaman audio) butuh duplex half di fetch Node.
      ...(adaBody ? { duplex: 'half' } : {}),
      redirect: 'manual',
      signal: AbortSignal.any([AbortSignal.timeout(BATAS_WAKTU_MS), request.signal]),
    } as RequestInit);
  } catch {
    return Response.json({ status: 'error', message: 'Layanan suara sedang tidak dapat dihubungi.', data: null }, { status: 502 });
  }
  const keluar = new Headers();
  balasan.headers.forEach((nilai, nama) => {
    if (!HEADER_KELUAR_DIBUANG.has(nama)) keluar.set(nama, nilai);
  });
  // NDJSON giliran dikirim per kalimat; jangan ditahan proxy di depan dashboard.
  keluar.set('x-accel-buffering', 'no');
  keluar.set('cache-control', balasan.headers.get('cache-control') ?? 'no-store');
  return new Response(balasan.body, { status: balasan.status, statusText: balasan.statusText, headers: keluar });
}
