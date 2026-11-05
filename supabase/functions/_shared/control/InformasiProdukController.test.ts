import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AdapterCekBpomTiruan, type AdapterCekBpom } from '../adapter/cekbpom.ts';
import { PenyediaEmbeddingTiruan, buatVektorTiruan, type PenyediaEmbedding } from '../adapter/embedding.ts';
import { normalkanNomorTelepon } from '../entity/penelepon.ts';
import { ErrorSigap, InformasiProdukController, PESAN_MINTA_NOMOR_TELEPON, type LogTool, type PenyimpananLayanan } from './InformasiProdukController.ts';

const PERCAKAPAN = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

type MateriPotonganSeed = {
  materiId: string;
  judul: string;
  rujukanSumber: string;
  status: 'aktif' | 'tidak_aktif';
  teks: string;
  embedding: number[];
};

function penyimpananTiruan(materiKustom?: MateriPotonganSeed[]) {
  const log: LogTool[] = [];
  const tiket: { percakapanId: string; nomorTelepon: string; ringkasan: string }[] = [];
  const materi: MateriPotonganSeed[] = materiKustom ?? [
    {
      materiId: '11111111-2222-4000-8000-000000000001',
      judul: 'Izin Edar Suplemen',
      rujukanSumber: 'Peraturan BPOM Nomor 17 Tahun 2019',
      status: 'aktif',
      teks: 'Ketentuan persyaratan izin edar suplemen kesehatan: Setiap produk suplemen kesehatan yang diedarkan di Indonesia wajib memiliki izin edar dari BPOM dan memenuhi kriteria keamanan, mutu, dan kemanfaatan sesuai Peraturan BPOM Nomor 17 Tahun 2019.',
      embedding: buatVektorTiruan('Ketentuan persyaratan izin edar suplemen kesehatan wajib memiliki izin edar BPOM'),
    },
    {
      materiId: '11111111-2222-4000-8000-000000000002',
      judul: 'Izin Edar Suplemen Lama (Nonaktif)',
      rujukanSumber: 'Keputusan Kepala BPOM tentang Suplemen Lama',
      status: 'tidak_aktif',
      teks: 'Materi nonaktif mengenai izin edar suplemen kesehatan terdahulu yang tidak berlaku lagi.',
      embedding: buatVektorTiruan('Materi nonaktif mengenai izin edar suplemen kesehatan terdahulu tidak berlaku'),
    },
    {
      materiId: '11111111-2222-4000-8000-000000000003',
      judul: 'Batas Cemaran Kosmetika',
      rujukanSumber: 'Peraturan BPOM Nomor 16 Tahun 2024',
      status: 'aktif',
      teks: 'Batas maksimum cemaran mikroba dan logam berat seperti timbal, merkuri, dan arsen dalam produk kosmetika.',
      embedding: buatVektorTiruan('Batas maksimum cemaran mikroba logam berat timbal merkuri arsen kosmetika'),
    },
  ];

  const p: PenyimpananLayanan = {
    async catatLogTool(l) { log.push(l); },
    async terbitkanTiketEskalasi(d) { tiket.push(d); return 'ESK-20261020-0001'; },
    async cariPotongan(vektorTarget, ambang, batas) {
      return materi
        .filter((m) => m.status === 'aktif')
        .map((m) => {
          let skor = 0;
          for (let i = 0; i < m.embedding.length; i++) skor += m.embedding[i] * (vektorTarget[i] ?? 0);
          return { teks: m.teks, judul: m.judul, rujukanSumber: m.rujukanSumber, skor: Number(skor.toFixed(4)) };
        })
        .filter((m) => m.skor >= ambang)
        .sort((a, b) => b.skor - a.skor)
        .slice(0, batas);
    },
  };
  return { p, log, tiket, materi };
}

const buat = (adapter: AdapterCekBpom = new AdapterCekBpomTiruan(), batasMs?: number, embedding: PenyediaEmbedding = new PenyediaEmbeddingTiruan()) => {
  const s = penyimpananTiruan();
  return { ...s, c: new InformasiProdukController(adapter, s.p, batasMs, embedding) };
};

test('req_1_3 Susu Formula Sehat mengembalikan satu hasil berstatus Berlaku', async () => {
  const { c, log } = buat();
  const { hasil } = await c.cekRegistrasi({ namaProduk: 'Susu Formula Sehat', percakapanId: PERCAKAPAN });
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].nomorIzinEdar, 'BPOM RI MD 865009001234');
  assert.equal(hasil[0].status, 'Berlaku');
  assert.deepEqual(log.map((l) => [l.namaTool, l.berhasil, l.percakapanId]), [['cek_registrasi_bpom', true, PERCAKAPAN]]);
});

test('req_1_5 hasil ganda dikembalikan seluruhnya agar agen bisa menyebut jumlahnya', async () => {
  const { c } = buat();
  const { hasil } = await c.cekRegistrasi({ namaProduk: 'paracetamol' });
  assert.equal(hasil.length, 4);
});

test('nfr_7 nama acak mengembalikan array kosong, bukan status karangan', async () => {
  const { c } = buat();
  assert.deepEqual(await c.cekRegistrasi({ namaProduk: 'Produk Xyz Tidak Ada' }), { hasil: [] });
});

test('nfr_2 adapter yang melewati batas waktu menghasilkan error terkendali dan tercatat gagal', async () => {
  const lambat: AdapterCekBpom = { cari: () => new Promise(() => {}) };
  const { c, log } = buat(lambat, 20);
  await assert.rejects(c.cekRegistrasi({ namaProduk: 'Susu' }), (e) => e instanceof ErrorSigap && e.status === 504);
  assert.equal(log[0].berhasil, false);
});

test('nfr_7 gangguan adapter menjadi error 502, bukan hasil', async () => {
  const rusak: AdapterCekBpom = { cari: async () => { throw new Error('jaringan'); } };
  const { c } = buat(rusak);
  await assert.rejects(c.cekRegistrasi({ namaProduk: 'Susu' }), (e) => e instanceof ErrorSigap && e.status === 502);
});

test('cek registrasi menolak nama kosong dan percakapanId bukan uuid', async () => {
  const { c } = buat();
  await assert.rejects(c.cekRegistrasi({ namaProduk: '  ' }), (e) => e instanceof ErrorSigap && e.status === 422);
  await assert.rejects(c.cekRegistrasi({ namaProduk: 'Susu', percakapanId: 'x' }), (e) => e instanceof ErrorSigap && e.status === 422);
});

test('req_1_7 nomor valid menerbitkan tiket ESK dengan nomor yang dinormalkan', async () => {
  const { c, tiket, log } = buat();
  const hasil = await c.terbitkanTiketEskalasi({ percakapanId: PERCAKAPAN, nomorTelepon: '+62 812-3456-7890', pertanyaan: 'Apakah obat batuk ini aman untuk ibu hamil?' });
  assert.deepEqual(hasil, { nomorTiket: 'ESK-20261020-0001' });
  assert.equal(tiket[0].nomorTelepon, '081234567890');
  assert.equal(log[0].namaTool, 'terbitkan_tiket_eskalasi');
});

test('req_1_7 nomor tidak valid ditolak dengan pesan minta ulang dan tidak menerbitkan tiket', async () => {
  const { c, tiket } = buat();
  await assert.rejects(
    c.terbitkanTiketEskalasi({ percakapanId: PERCAKAPAN, nomorTelepon: '12345', pertanyaan: 'Aman untuk ibu hamil?' }),
    (e) => e instanceof ErrorSigap && e.status === 422 && e.message === PESAN_MINTA_NOMOR_TELEPON,
  );
  assert.equal(tiket.length, 0);
});

test('req_1_7 adapter supabase membuat baris percakapan sebelum menerbitkan tiket ESK', () => {
  // Adapter memakai npm: dan Deno.env sehingga tidak bisa diimpor di node; urutannya dicek dari sumber.
  const sumber = readFileSync(new URL('../adapter/penyimpananSupabase.ts', import.meta.url), 'utf8');
  const eskalasi = sumber.slice(sumber.indexOf('async terbitkanTiketEskalasi('), sumber.indexOf('async cariPotongan('));
  const pastikan = eskalasi.indexOf("await this.pastikanPercakapan(data.percakapanId, 'informasi_produk');");
  assert.ok(pastikan >= 0, 'baris percakapan dipastikan ada');
  assert.ok(pastikan < eskalasi.indexOf("rpc('terbitkan_tiket_eskalasi'"), 'sebelum RPC eskalasi');
  // Baris yang sudah ada, misalnya percakapan pengaduan, tidak diubah.
  assert.match(sumber, /\.upsert\(\{ id: percakapanId, jenis_interaksi: jenis \}, \{ onConflict: 'id', ignoreDuplicates: true \}\)/);
});

test('bug_32 percakapan tidak ditemukan tetap tercatat di log_tool tanpa percakapan dengan berhasil false', async () => {
  const log: LogTool[] = [];
  const p: PenyimpananLayanan = {
    async catatLogTool(l) {
      if (l.percakapanId !== null) throw new Error('violates foreign key constraint');
      log.push(l);
    },
    async terbitkanTiketEskalasi() { throw new ErrorSigap(404, 'Percakapan tidak ditemukan.'); },
    async cariPotongan() { return []; },
  };
  const c = new InformasiProdukController(new AdapterCekBpomTiruan(), p);
  await assert.rejects(
    c.terbitkanTiketEskalasi({ percakapanId: PERCAKAPAN, nomorTelepon: '081234567890', pertanyaan: 'Aman untuk ibu hamil?' }),
    (e: unknown) => e instanceof ErrorSigap && e.status === 404,
  );
  assert.deepEqual(log.map((l) => [l.namaTool, l.berhasil, l.percakapanId]), [['terbitkan_tiket_eskalasi', false, null]]);
});

test('bug_32 log yang ditolak karena percakapanId dicatat ulang tanpa percakapan', async () => {
  const log: LogTool[] = [];
  const p: PenyimpananLayanan = {
    async catatLogTool(l) {
      if (l.percakapanId !== null) throw new Error('violates foreign key constraint');
      log.push(l);
    },
    async terbitkanTiketEskalasi() { return 'ESK-20261020-0001'; },
    async cariPotongan() { return []; },
  };
  const c = new InformasiProdukController(new AdapterCekBpomTiruan(), p);
  await c.cekRegistrasi({ namaProduk: 'Susu Formula Sehat', percakapanId: PERCAKAPAN });
  assert.deepEqual(log.map((l) => [l.namaTool, l.berhasil, l.percakapanId]), [['cek_registrasi_bpom', true, null]]);
});

test('nomor telepon format Indonesia: 08… atau +628…, 10–13 digit', () => {
  assert.equal(normalkanNomorTelepon('0812345678'), '0812345678');
  assert.equal(normalkanNomorTelepon('0812345678901'), '0812345678901');
  assert.equal(normalkanNomorTelepon('+6281234567890'), '081234567890');
  assert.equal(normalkanNomorTelepon('081234567'), null);
  assert.equal(normalkanNomorTelepon('08123456789012'), null);
  assert.equal(normalkanNomorTelepon('0212345678'), null);
});

test('t_f1_3_02 pertanyaan tentang izin edar suplemen mengembalikan potongan dengan rujukan Peraturan BPOM Nomor 17 Tahun 2019', async () => {
  const { c, log } = buat();
  const res = await c.cariPengetahuan({
    pertanyaan: 'Bagaimana persyaratan izin edar suplemen kesehatan di BPOM?',
    percakapanId: PERCAKAPAN,
  });
  assert.ok(res.potongan.length > 0);
  assert.equal(res.potongan[0].rujukanSumber, 'Peraturan BPOM Nomor 17 Tahun 2019');
  assert.equal(res.potongan[0].judul, 'Izin Edar Suplemen');
  assert.ok(res.potongan[0].skor >= 0.7);
  assert.deepEqual(log.map((l) => [l.namaTool, l.berhasil, l.percakapanId]), [['cari_basis_pengetahuan', true, PERCAKAPAN]]);
});

test('t_f1_3_02 materi nonaktif tidak pernah muncul di hasil pencarian', async () => {
  const { c } = buat();
  const res = await c.cariPengetahuan({
    pertanyaan: 'Materi mengenai izin edar suplemen kesehatan terdahulu',
  });
  // Pastikan tidak ada rujukan materi yang tidak aktif
  for (const p of res.potongan) {
    assert.notEqual(p.rujukanSumber, 'Keputusan Kepala BPOM tentang Suplemen Lama');
    assert.notEqual(p.judul, 'Izin Edar Suplemen Lama (Nonaktif)');
  }
  assert.ok(res.potongan.every((p) => p.rujukanSumber === 'Peraturan BPOM Nomor 17 Tahun 2019'));
});

test('t_f1_3_02 hasil di bawah ambang kemiripan dikembalikan berupa array kosong', async () => {
  const { c } = buat();
  const res = await c.cariPengetahuan({
    pertanyaan: 'Bagaimana cara memperbaiki kulkas yang rusak di rumah?',
  });
  assert.deepEqual(res, { potongan: [] });
});

test('t_f1_3_02 pertanyaan kosong ditolak dengan 422 Pertanyaan wajib diisi', async () => {
  const { c } = buat();
  await assert.rejects(
    c.cariPengetahuan({ pertanyaan: '   ' }),
    (e) => e instanceof ErrorSigap && e.status === 422 && e.message === 'Pertanyaan wajib diisi.',
  );
  await assert.rejects(
    c.cariPengetahuan({ pertanyaan: 123 }),
    (e) => e instanceof ErrorSigap && e.status === 422 && e.message === 'Pertanyaan wajib diisi.',
  );
});

test('t_f1_3_02 cariJawaban merupakan alias cariPengetahuan sesuai Class Diagram SRS', async () => {
  const { c } = buat();
  const res = await c.cariJawaban({
    pertanyaan: 'izin edar suplemen kesehatan',
  });
  assert.ok(res.potongan.length > 0);
  assert.equal(res.potongan[0].rujukanSumber, 'Peraturan BPOM Nomor 17 Tahun 2019');
});
