// Layanan luar tiruan untuk uji penerimaan: cekbpom (/all-produk dan /produk-dt/all) dan Hermes (/v1/chat/completions).
// Skenario control memakai cekbpomTiruan langsung sebagai fetch. Skenario @ui UC-01 menyalakan server di PORT_TIRUAN, yang
// dipakai Voice Gateway lewat CEKBPOM_BASE_URL dan HERMES_URL (features/README.md), jadi adapter CekBpom dan aliranHermes
// yang asli ikut teruji. Hanya untuk uji; gateway produksi tidak pernah diarahkan ke sini.
import { createServer } from 'node:http';
import { AfterAll } from '@cucumber/cucumber';

export const PORT_TIRUAN = 8091;
/** Data registrasi cekbpom dan jawaban AI untuk server tiruan, diisi Background skenario @ui UC-01. */
export const tiruan = { data: [], pencarian: [], gangguan: false, jawaban: new Map() };

// Meniru filter cekbpom: kolom yang diisi dicocokkan sebagai substring tanpa membedakan huruf besar.
export function cekbpomTiruan(dunia) {
  return async (url, opsi = {}) => {
    if (dunia.gangguan) throw new Error('cekbpom tidak terjangkau');
    if (url.endsWith('/all-produk')) {
      return new Response('<meta name="csrf-token" content="tok">', { headers: { 'set-cookie': 'sesi=1; Path=/' } });
    }
    const f = new URLSearchParams(opsi.body);
    dunia.pencarian.push(Object.fromEntries([...f].filter(([k, v]) => v && k.startsWith('product_'))));
    const cocok = (isi, cari) => !cari || isi.toLowerCase().includes(cari.toLowerCase());
    const baris = dunia.data.filter((d) =>
      cocok(d.nama, f.get('product_name')) && cocok(d.merek, f.get('product_brand')) && cocok(d.nomor, f.get('product_register')));
    return Response.json({
      recordsFiltered: baris.length,
      data: baris.map((d) => ({ PRODUCT_NAME: d.nama, PRODUCT_BRANDS: d.merek, PRODUCT_REGISTER: d.nomor, STATUS: d.status, REGISTRAR: d.pendaftar })),
    });
  };
}

// Hermes tiruan menjawab ucapan terakhir penelepon dari tabel "the AI agent answers" dalam satu event SSE, dengan `usage`
// seperti Hermes agar anggaran token AI gateway tidak habis oleh run berulang. Ucapan di luar tabel dijawab 500 (panel
// menampilkan gangguan) dan ditulis ke stderr, supaya skenario yang gagal karenanya langsung terlihat penyebabnya.
async function layani(req, res) {
  let body = '';
  for await (const bagian of req) body += bagian;
  if (req.url === '/v1/chat/completions') {
    const ucapan = JSON.parse(body).messages.findLast((m) => m.role === 'user')?.content;
    const jawaban = tiruan.jawaban.get(ucapan);
    if (jawaban === undefined) {
      console.error(`Hermes tiruan: tidak ada jawaban untuk "${ucapan}"`);
      return res.writeHead(500).end();
    }
    const event = { choices: [{ delta: { content: jawaban } }], usage: { total_tokens: 1 } };
    return res.writeHead(200, { 'content-type': 'text/event-stream' }).end(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`);
  }
  const r = await cekbpomTiruan(tiruan)(req.url, { body });
  res.writeHead(r.status, Object.fromEntries(r.headers)).end(await r.text());
}

let server = null;

/** Menyalakan server tiruan sekali per run. Hanya langkah skenario @ui yang memanggilnya, jadi `npm run test:bdd` tidak membuka port. */
export async function mulaiTiruan() {
  if (server) return;
  const s = createServer(layani);
  await new Promise((siap, gagal) => s.once('error', gagal).listen(PORT_TIRUAN, '127.0.0.1', siap));
  server = s;
}

// Server yang masih terbuka menahan proses cucumber (forceExit false).
AfterAll(() => server?.close());
