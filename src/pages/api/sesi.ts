// Boundary UC-03 (NFR-12): browser melapor aktivitas petugas. Middleware memeriksa sesi dan mencatat aktivitasnya,
// atau menjawab 401 bila sesi sudah idle melewati batas.
import type { APIRoute } from 'astro';

export const POST: APIRoute = () => Response.json({ status: 'success', message: 'OK', data: null });
