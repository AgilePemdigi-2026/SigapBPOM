// Proxy /voice/* ke Voice Gateway (lihat src/lib/proxyVoice.ts). Hanya aktif bila VOICE_GATEWAY_URL diisi; di VPS,
// Caddy menangani /voice/* sebelum permintaan sampai ke Astro.
import type { APIRoute } from 'astro';
import { alamatKlien } from '../../lib/pembatasLaju';
import { teruskanKeGateway } from '../../lib/proxyVoice';

export const ALL: APIRoute = async ({ request, clientAddress }) => {
  const gatewayUrl = (process.env.VOICE_GATEWAY_URL ?? '').trim();
  if (!gatewayUrl) return Response.json({ status: 'error', message: 'Tidak ditemukan.', data: null }, { status: 404 });
  let soket = '';
  try {
    soket = clientAddress;
  } catch {
    // Alamat soket tidak tersedia di semua mode.
  }
  return teruskanKeGateway(request, {
    gatewayUrl,
    ipKlien: alamatKlien(request.headers, soket || 'tak-dikenal'),
    kunciProxy: (process.env.VOICE_PROXY_KUNCI ?? '').trim(),
  });
};
