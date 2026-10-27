import type { APIRoute } from 'astro';
import { MateriSupabase } from '../../../lib/adapter/materiSupabase';
import { BasisPengetahuanController } from '../../../lib/control/BasisPengetahuanController';

export const GET: APIRoute = async () => {
  try {
    const materi = await new BasisPengetahuanController(new MateriSupabase()).daftar();
    return Response.json({ status: 'success', message: 'OK', data: { materi } });
  } catch (error) {
    console.error('Daftar materi gagal dimuat', error instanceof Error ? error.message : 'unknown');
    return Response.json({ status: 'error', message: 'Daftar materi gagal dimuat.', data: null }, { status: 500 });
  }
};