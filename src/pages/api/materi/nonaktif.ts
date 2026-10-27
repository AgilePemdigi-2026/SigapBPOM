import type { APIRoute } from 'astro';
import { MateriSupabase } from '../../../lib/adapter/materiSupabase';
import { BasisPengetahuanController, ErrorBasisPengetahuan } from '../../../lib/control/BasisPengetahuanController';

export const POST: APIRoute = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: 'error', message: 'Permintaan tidak valid.', data: null }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return Response.json({ status: 'error', message: 'Permintaan tidak valid.', data: null }, { status: 400 });
  }

  try {
    await new BasisPengetahuanController(new MateriSupabase()).nonaktifkan({
      materiId: (body as { id?: unknown }).id,
      petugasId: locals.petugas?.id,
    });
    return Response.json({ status: 'success', message: 'Materi ditandai tidak aktif.', data: null });
  } catch (error) {
    const status = error instanceof ErrorBasisPengetahuan ? error.status : 500;
    const message = error instanceof ErrorBasisPengetahuan ? error.message : 'Materi gagal dinonaktifkan.';
    if (status === 500) console.error('Materi gagal dinonaktifkan', error instanceof Error ? error.message : 'unknown');
    return Response.json({ status: 'error', message, data: null }, { status });
  }
};