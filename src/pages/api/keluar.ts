// Boundary UC-03: logout menghapus sesi di server beserta cookie-nya.
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ locals, cookies }) => {
  await locals.autentikasi.keluar(cookies);
  return Response.json({ status: 'success', message: 'OK', data: null });
};
