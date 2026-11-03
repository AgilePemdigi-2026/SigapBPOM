import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CekBpom, cekRegistrasi, hasilProduk, kueriProduk, pesanCekBpom } from './cekbpom.mjs';

test('req_1_3 kueri produk dikenali dari pertanyaan status registrasi', () => {
  assert.deepEqual(kueriProduk('Apakah Indomie goreng sudah terdaftar di BPOM?'), { nama: 'indomie goreng' });
  assert.deepEqual(kueriProduk('tolong cek produk wardah lightening serum'), { nama: 'wardah lightening serum' });
  assert.deepEqual(kueriProduk('nomor izin edarnya MD 304110267157'), { nomor: 'MD 304110267157' });
  // Nama saja cukup bila menjawab "Silakan sebutkan nama produk".
  assert.deepEqual(kueriProduk('Indomie goreng', true), { nama: 'indomie goreng' });
  assert.equal(kueriProduk('Indomie goreng'), null);
});

test('req_1_3 pertanyaan edukasi tidak dicari di cekbpom', () => {
  assert.equal(kueriProduk('Bagaimana cara cek nomor registrasi kosmetik?'), null);
  assert.equal(kueriProduk('Apa itu BPOM?', true), null);
  assert.equal(kueriProduk('Apakah sudah terdaftar?'), null);
});

test('req_1_3 ucapan pengaduan atau keluhan tidak dicari di cekbpom', () => {
  assert.equal(kueriProduk('Saya mau daftar pengaduan krim pemutih palsu'), null);
  assert.equal(kueriProduk('krim wardah yang saya beli tidak ada izin edar, kulit saya gatal'), null);
  assert.equal(kueriProduk('saya mau lapor produk tidak terdaftar', true), null);
});

const baris = (n) => ({ PRODUCT_NAME: `Produk ${n}`, PRODUCT_BRANDS: 'Merek', PRODUCT_REGISTER: `MD 00${n}`, STATUS: 'Berlaku', REGISTRAR: 'PT &amp; Co', PRODUCT_EXPIRED: '2027-12-12' });

function fetchTiruan(data, log = []) {
  return async (url, opsi = {}) => {
    log.push({ url, opsi });
    if (url.endsWith('/all-produk')) {
      return new Response('<meta name="csrf-token" content="tok123">', { headers: { 'set-cookie': 'sesi=abc; Path=/' } });
    }
    return Response.json({ recordsFiltered: data.length, data });
  };
}

test('req_1_3 pencarian memakai sesi CSRF, merapikan teks, dan memakai cache', async () => {
  const log = [];
  const cek = new CekBpom({ fetch: fetchTiruan([baris(1), baris(2)], log) });
  const hasil = await cek.cari({ nama: 'produk' });
  assert.equal(hasil.total, 2);
  assert.equal(hasil.produk[0].pendaftar, 'PT & Co');
  const cari = log.filter((l) => l.url.endsWith('/produk-dt/all'));
  assert.equal(cari[0].opsi.headers['x-csrf-token'], 'tok123');
  assert.equal(cari[0].opsi.headers.cookie, 'sesi=abc');
  assert.ok(cari.some((c) => /product_name=produk&/.test(c.opsi.body)), 'dicari per nama produk');
  assert.ok(cari.some((c) => /product_brand=produk&/.test(c.opsi.body) && /length=50&/.test(c.opsi.body)), 'dicari per merek, 50 baris');
  await cek.cari({ nama: 'Produk' });
  assert.equal(log.length, 3, 'kueri sama tidak memanggil cekbpom lagi');
});

test('req_1_3 hasil per merek disaring dengan sisa kata nama produk', async () => {
  const cek = new CekBpom({
    fetch: async (url, opsi) => {
      if (url.endsWith('/all-produk')) return new Response('<meta name="csrf-token" content="t">');
      if (/product_brand=indomie&/.test(opsi.body)) {
        return Response.json({ recordsFiltered: 2, data: [{ PRODUCT_NAME: 'Mi Instan Goreng', PRODUCT_REGISTER: 'MD 1', STATUS: 'Berlaku' }, { PRODUCT_NAME: 'Mi Instan Soto', PRODUCT_REGISTER: 'MD 2', STATUS: 'Berlaku' }] });
      }
      return Response.json({ recordsFiltered: 0, data: [] });
    },
  });
  const hasil = await cek.cari({ nama: 'indomie goreng' });
  assert.deepEqual(hasil.produk.map((p) => p.nomorIzinEdar), ['MD 1']);
});

test('req_1_3 merek di kata mana pun: "susu greenfield" ditemukan lewat merek Greenfields', async () => {
  const cek = new CekBpom({
    fetch: async (url, opsi) => {
      if (url.endsWith('/all-produk')) return new Response('<meta name="csrf-token" content="t">');
      if (/product_brand=greenfield&/.test(opsi.body)) {
        return Response.json({ recordsFiltered: 209, data: [
          { PRODUCT_NAME: 'Susu UHT Full Cream', PRODUCT_BRANDS: 'Greenfields', PRODUCT_REGISTER: 'MD 400213330621', STATUS: 'Berlaku' },
          { PRODUCT_NAME: 'Krim Whipping', PRODUCT_BRANDS: 'Greenfields', PRODUCT_REGISTER: 'MD 402513022621', STATUS: 'Berlaku' },
        ] });
      }
      if (/product_brand=susu&/.test(opsi.body)) {
        return Response.json({ recordsFiltered: 117, data: [{ PRODUCT_NAME: 'Susu Lemak Penuh', PRODUCT_BRANDS: 'SUKASUSU', PRODUCT_REGISTER: 'MD 9', STATUS: 'Berlaku' }] });
      }
      return Response.json({ recordsFiltered: 0, data: [] });
    },
  });
  const hasil = await cek.cari(kueriProduk('Apakah susu Greenfield sudah terdaftar di BPOM?'));
  assert.deepEqual(hasil.produk.map((p) => p.nomorIzinEdar), ['MD 400213330621']);
});

test('req_1_3 kueri merek yang gagal tidak menggagalkan hasil kueri lain', async () => {
  const cek = new CekBpom({
    fetch: async (url, opsi) => {
      if (url.endsWith('/all-produk')) return new Response('<meta name="csrf-token" content="t">');
      if (/product_brand=goreng&/.test(opsi.body)) throw new Error('timeout');
      if (/product_brand=indomie&/.test(opsi.body)) return Response.json({ recordsFiltered: 1, data: [baris(1)].map((b) => ({ ...b, PRODUCT_NAME: 'Mi Goreng' })) });
      return Response.json({ recordsFiltered: 0, data: [] });
    },
  });
  assert.deepEqual((await cek.cari({ nama: 'indomie goreng' })).produk.map((p) => p.nomorIzinEdar), ['MD 001']);
});

test('nfr_7 kueri yang gagal tanpa hasil tidak disimpulkan tidak ditemukan', async () => {
  const cek = new CekBpom({
    fetch: async (url, opsi) => {
      if (url.endsWith('/all-produk')) return new Response('<meta name="csrf-token" content="t">');
      if (/product_brand=goreng&/.test(opsi.body)) throw new Error('timeout');
      return Response.json({ recordsFiltered: 0, data: [] });
    },
  });
  await assert.rejects(cek.cari({ nama: 'indomie goreng' }), /cekbpom cari gagal/);
});

test('req_1_3 token kedaluwarsa (419) membuka sesi baru sekali', async () => {
  let panggil = 0;
  const cek = new CekBpom({
    fetch: async (url) => {
      if (url.endsWith('/all-produk')) return new Response('<meta name="csrf-token" content="t">');
      panggil += 1;
      return panggil === 1 ? new Response('', { status: 419 }) : Response.json({ data: [baris(1)] });
    },
  });
  assert.equal((await cek.cari({ nomor: 'MD 001' })).produk.length, 1);
});

test('nfr_7 status izin yang tidak dikenal tidak ditebak sebagai Berlaku', async () => {
  for (const STATUS of [undefined, '', 'Dibekukan']) {
    const cek = new CekBpom({ fetch: fetchTiruan([{ ...baris(1), STATUS }]) });
    const hasil = await cekRegistrasi(cek, 'nomor izin edar MD 001234567');
    assert.equal(hasil.produk, undefined, `STATUS ${STATUS}`);
    assert.match(hasil.galat, /status tidak dikenal/);
    assert.match(hasil.konteks, /Jangan menyebut status atau nomor izin edar/);
  }
  const cek = new CekBpom({ fetch: fetchTiruan([{ ...baris(1), STATUS: 'Tidak Berlaku' }]) });
  assert.equal((await cek.cari({ nomor: 'MD 001' })).produk[0].status, 'Tidak Berlaku');
});

test('nfr_2 cek registrasi dihentikan setelah 5 detik dan diperlakukan sebagai gangguan', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const proses = cekRegistrasi({ cari: () => new Promise(() => {}) }, 'nomor izin edar MD 001234567');
  t.mock.timers.tick(5000);
  const hasil = await proses;
  assert.equal(hasil.galat, 'cekbpom batas waktu');
  assert.equal(hasil.produk, undefined);
  assert.match(hasil.konteks, /Jangan menyebut status atau nomor izin edar/);
});

test('br_7 kartu produk: tunggal, kandidat maksimal tiga, atau tidak ditemukan', () => {
  assert.equal(hasilProduk({ produk: [] }).jenis, 'tidak_ditemukan');
  assert.equal(hasilProduk({ produk: [baris(1)].map((b) => ({ nama: b.PRODUCT_NAME })) }).jenis, 'tunggal');
  const k = hasilProduk({ produk: [1, 2, 3, 4, 5].map((n) => ({ nama: `P${n}` })) });
  assert.equal(k.jenis, 'kandidat');
  assert.equal(k.produk.length, 3);
});

test('nfr_7 pesan ke AI hanya memuat data cekbpom dan tidak menyimpulkan ilegal', () => {
  const p = { nama: 'Produk 1', merek: 'Merek', nomorIzinEdar: 'MD 001', status: 'Berlaku', pendaftar: 'PT A', berlakuSampai: '2027-12-12' };
  assert.match(pesanCekBpom({ nama: 'produk' }, { total: 1, produk: [p] }), /^Hasil pencarian data registrasi BPOM[\s\S]*MD 001, status Berlaku/);
  assert.match(pesanCekBpom({ nama: 'x' }, { total: 0, produk: [] }), /Jangan menyimpulkan produk itu ilegal/);
  assert.match(pesanCekBpom({ nama: 'x' }, null), /Jangan menyebut status atau nomor izin edar/);
});
