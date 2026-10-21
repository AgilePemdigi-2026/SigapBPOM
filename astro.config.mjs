import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Render di server agar sesi petugas diperiksa sebelum halaman dashboard dikirim (PROJECT_RULES 5.4).
// Mode standalone menghasilkan server Node untuk VPS di belakang Nginx (ADR 0001).
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  redirects: { '/': '/homepage' },
});
