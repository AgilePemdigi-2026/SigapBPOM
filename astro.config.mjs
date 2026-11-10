import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Render di server agar sesi petugas diperiksa sebelum halaman dashboard dikirim (PROJECT_RULES 5.4).
// Mode standalone menghasilkan server Node untuk VPS di belakang Caddy (ADR 0004).
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  redirects: { '/': '/homepage' },
  vite: {
    // Hanya dev server: /voice/* diteruskan ke Voice Gateway lokal, seperti Caddy di VPS, agar panel suara bisa dipakai
    // dan diuji di `npm run dev`.
    server: { proxy: { '/voice': process.env.VOICE_GATEWAY_URL || 'http://127.0.0.1:8090' } },
    // Modul mock tanpa efek samping, jadi build produksi membuang korpus tiruan yang tidak dipakai.
    build: { rolldownOptions: { treeshake: { moduleSideEffects: (id) => !id.includes('/src/lib/mock/') } } },
  },
});
