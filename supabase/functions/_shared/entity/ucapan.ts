// Entity UC-01: ucapan dalam transkrip percakapan (T-F1.1-03, NFR-20).
// Daftar pembicara harus sama dengan enum public.pembicara di migrasi inti_percakapan dan PEMBICARA di voice-gateway/transkrip.mjs.

export const PEMBICARA = ['sistem', 'penelepon'] as const;
export type Pembicara = (typeof PEMBICARA)[number];
