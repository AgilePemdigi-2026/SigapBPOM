import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatPengirimSms, GalatSmsTidakPasti, PengirimSmsAndroid, PengirimSmsTiruan, PengirimSmsZenziva, URL_SMSGATE_BAWAAN, URL_ZENZIVA_BAWAAN } from '../adapter/sms.ts';
import type { HasilNotifikasi, NotifikasiDiklaim, StatusKirimNotifikasi } from '../entity/notifikasi.ts';
import {
  BATAS_PERCOBAAN_KIRIM,
  GALAT_NOMOR_TIDAK_TERSEDIA,
  PenangananController,
  type PenyimpananNotifikasi,
  teksSms,
  teksSmsTindakLanjut,
} from './PenangananController.ts';
import { pesanTiketPengaduan } from '../../../../voice-gateway/pengaduan.mjs';
import { pesanTiketEskalasi } from '../../../../voice-gateway/eskalasi.mjs';

const TIKET_A = 'ADU-20261105-0001';
const TIKET_B = 'ADU-20261105-0002';
const NOMOR_A = '081234567890';
const NOMOR_B = '085712345678';

interface Baris {
  id: string;
  noTiket: string;
  status: StatusKirimNotifikasi;
  percobaan: number;
  isi: string | null;
  galat: string | null;
}

/**
 * Antrean tiruan yang mengikuti migrasi 20261105120000: tutup_tiket mengantrekan satu baris per tiket, klaim hanya
 * mengambil tertunda atau gagal dan menandainya mengirim, catat hasil hanya mengubah baris yang sedang mengirim.
 */
function antreanTiruan(nomorPerTiket: Record<string, string | null>) {
  const baris: Baris[] = [];
  const p: PenyimpananNotifikasi = {
    async klaimNotifikasiTertunda(batas, batasPercobaan) {
      const dipilih = baris
        .filter((b) => (b.status === 'tertunda' || b.status === 'gagal') && b.percobaan < batasPercobaan)
        .slice(0, batas);
      return dipilih.map((b): NotifikasiDiklaim => {
        b.status = 'mengirim';
        b.percobaan++;
        return { id: b.id, jenis: 'tindak_lanjut', noTiket: b.noTiket, nomorTelepon: nomorPerTiket[b.noTiket] ?? null };
      });
    },
    async catatHasilNotifikasi(hasil: HasilNotifikasi) {
      const b = baris.find((x) => x.id === hasil.id && x.status === 'mengirim');
      if (!b) return;
      b.status = hasil.status;
      if (hasil.status === 'terkirim') {
        b.isi = hasil.isi;
        b.galat = null;
      } else {
        b.galat = hasil.galat;
      }
    },
  };
  // Simulasi tutup_tiket -> antrekan_notifikasi_tindak_lanjut (insert ... on conflict do nothing).
  const tutupTiket = (noTiket: string) => {
    if (!baris.some((b) => b.noTiket === noTiket)) {
      baris.push({ id: `n-${baris.length + 1}`, noTiket, status: 'tertunda', percobaan: 0, isi: null, galat: null });
    }
  };
  return { p, baris, tutupTiket };
}

function rakit(nomorPerTiket: Record<string, string | null> = { [TIKET_A]: NOMOR_A, [TIKET_B]: NOMOR_B }) {
  const antrean = antreanTiruan(nomorPerTiket);
  const sms = new PengirimSmsTiruan();
  const controller = new PenangananController(antrean.p, sms);
  return { ...antrean, sms, controller };
}

test('req_6_6 menutup tiket menghasilkan tepat satu notifikasi terkirim lewat SMS tiruan', async (t) => {
  t.mock.method(console, 'info', () => {});
  const { controller, sms, baris, tutupTiket } = rakit();

  tutupTiket(TIKET_A);
  const ringkasan = await controller.kirimNotifikasi();

  assert.deepEqual(ringkasan, { diproses: 1, terkirim: 1, gagal: 0 });
  assert.equal(sms.terkirim.length, 1);
  assert.deepEqual(sms.terkirim[0], { nomorTelepon: NOMOR_A, teks: teksSmsTindakLanjut(TIKET_A) });
  assert.equal(baris.length, 1);
  assert.equal(baris[0].status, 'terkirim');
  assert.equal(baris[0].isi, teksSmsTindakLanjut(TIKET_A));
});

test('req_6_6 menutup tiket dua kali tetap mengirim satu SMS', async (t) => {
  t.mock.method(console, 'info', () => {});
  const { controller, sms, baris, tutupTiket } = rakit();

  tutupTiket(TIKET_A);
  tutupTiket(TIKET_A);
  await controller.kirimNotifikasi();

  assert.equal(baris.length, 1);
  assert.equal(sms.terkirim.length, 1);
});

test('req_6_6 gagal kirim tercatat beserta galatnya dan berhasil saat diulang', async (t) => {
  t.mock.method(console, 'info', () => {});
  const { controller, sms, baris, tutupTiket } = rakit();
  tutupTiket(TIKET_A);
  sms.gagalkan(1, 'Gateway tidak menjawab.');

  const pertama = await controller.kirimNotifikasi();
  assert.deepEqual(pertama, { diproses: 1, terkirim: 0, gagal: 1 });
  assert.equal(baris[0].status, 'gagal');
  assert.equal(baris[0].galat, 'Gateway tidak menjawab.');
  assert.equal(sms.terkirim.length, 0);

  const kedua = await controller.kirimNotifikasi();
  assert.deepEqual(kedua, { diproses: 1, terkirim: 1, gagal: 0 });
  assert.equal(baris[0].status, 'terkirim');
  assert.equal(baris[0].galat, null);
  assert.equal(baris[0].percobaan, 2);
  assert.equal(sms.terkirim.length, 1);
});

test('req_6_6 putaran ulang hanya mengirim yang gagal, bukan yang sudah terkirim', async (t) => {
  t.mock.method(console, 'info', () => {});
  const { controller, sms, baris, tutupTiket } = rakit();
  tutupTiket(TIKET_A);
  tutupTiket(TIKET_B);
  sms.gagalkan(1);

  await controller.kirimNotifikasi();
  assert.deepEqual(baris.map((b) => b.status), ['gagal', 'terkirim']);

  const ulang = await controller.kirimNotifikasi();
  assert.deepEqual(ulang, { diproses: 1, terkirim: 1, gagal: 0 });
  assert.deepEqual(sms.terkirim.map((s) => s.nomorTelepon), [NOMOR_B, NOMOR_A]);
});

test('req_6_6 menjalankan ulang sesudah terkirim tidak mengirim SMS ganda', async (t) => {
  t.mock.method(console, 'info', () => {});
  const { controller, sms, tutupTiket } = rakit();
  tutupTiket(TIKET_A);

  await controller.kirimNotifikasi();
  const ulang = await controller.kirimNotifikasi();
  tutupTiket(TIKET_A);
  const ulangSesudahTutupLagi = await controller.kirimNotifikasi();

  assert.deepEqual(ulang, { diproses: 0, terkirim: 0, gagal: 0 });
  assert.deepEqual(ulangSesudahTutupLagi, { diproses: 0, terkirim: 0, gagal: 0 });
  assert.equal(sms.terkirim.length, 1);
});

test('req_6_6 dua putaran bersamaan tidak mengirim SMS ganda', async (t) => {
  t.mock.method(console, 'info', () => {});
  const { controller, sms, tutupTiket } = rakit();
  tutupTiket(TIKET_A);
  tutupTiket(TIKET_B);

  const [a, b] = await Promise.all([controller.kirimNotifikasi(), controller.kirimNotifikasi()]);

  assert.equal(a.terkirim + b.terkirim, 2);
  assert.equal(sms.terkirim.length, 2);
});

test('req_6_6 notifikasi tanpa nomor tujuan tercatat gagal tanpa memanggil gateway', async (t) => {
  t.mock.method(console, 'info', () => {});
  const { controller, sms, baris, tutupTiket } = rakit({ [TIKET_A]: null });
  tutupTiket(TIKET_A);

  const ringkasan = await controller.kirimNotifikasi();

  assert.deepEqual(ringkasan, { diproses: 1, terkirim: 0, gagal: 1 });
  assert.equal(baris[0].galat, GALAT_NOMOR_TIDAK_TERSEDIA);
  assert.equal(sms.terkirim.length, 0);
});

test('req_6_6 notifikasi yang terus gagal berhenti diklaim setelah batas percobaan', async (t) => {
  t.mock.method(console, 'info', () => {});
  const { controller, sms, baris, tutupTiket } = rakit();
  tutupTiket(TIKET_A);
  sms.gagalkan(BATAS_PERCOBAAN_KIRIM + 1);

  for (let i = 0; i < BATAS_PERCOBAAN_KIRIM + 1; i++) await controller.kirimNotifikasi();

  assert.equal(baris[0].percobaan, BATAS_PERCOBAAN_KIRIM);
  assert.equal(baris[0].status, 'gagal');
});

test('nfr_13 log, ringkasan, dan galat tersimpan tidak memuat nomor telepon utuh', async (t) => {
  const log = t.mock.method(console, 'info', () => {});
  const galatLog = t.mock.method(console, 'error', () => {});
  const { controller, sms, baris, tutupTiket } = rakit();
  tutupTiket(TIKET_A);
  tutupTiket(TIKET_B);
  // Galat gateway yang menyebut nomor tujuan tetap disamarkan sebelum disimpan.
  sms.gagalkan(1, `Nomor ${NOMOR_A} ditolak operator.`);

  const ringkasan = await controller.kirimNotifikasi();

  const keluaran = [
    JSON.stringify(ringkasan),
    ...log.mock.calls.map((c) => c.arguments.join(' ')),
    ...galatLog.mock.calls.map((c) => c.arguments.join(' ')),
    ...baris.map((b) => `${b.galat ?? ''} ${b.isi ?? ''}`),
  ].join('\n');
  for (const nomor of [NOMOR_A, NOMOR_B]) assert.ok(!keluaran.includes(nomor), `nomor ${nomor.slice(0, 4)} bocor`);
  assert.equal(baris[0].galat, 'Nomor 0812****7890 ditolak operator.');
  assert.ok(log.mock.calls.some((c) => c.arguments.includes('0857****5678')));
});

test('req_6_6 teks SMS tindak lanjut memuat nomor tiket dan bukan data pribadi', () => {
  const teks = teksSmsTindakLanjut(TIKET_A);
  assert.ok(teks.includes(TIKET_A));
  assert.doesNotMatch(teks, /08\d{8,}/);
});

test('req_6_6 SMS_ADAPTER wajib dipilih: tiruan untuk lokal, zenziva butuh kredensial, nilai lain ditolak', () => {
  assert.throws(() => buatPengirimSms(undefined), /belum diatur/);
  assert.throws(() => buatPengirimSms(' '), /belum diatur/);
  assert.ok(buatPengirimSms('tiruan') instanceof PengirimSmsTiruan);
  assert.throws(() => buatPengirimSms('resmi'), /belum tersedia/);
  assert.throws(() => buatPengirimSms('zenziva', () => undefined), /ZENZIVA_USERKEY dan ZENZIVA_PASSKEY wajib diisi/);
  const env: Record<string, string> = { ZENZIVA_USERKEY: 'uk', ZENZIVA_PASSKEY: 'pk' };
  const zenziva = buatPengirimSms('zenziva', (n) => env[n]);
  assert.ok(zenziva instanceof PengirimSmsZenziva);
  assert.equal(zenziva.url, URL_ZENZIVA_BAWAAN);
});

const zenzivaPalsu = (status: number, isi: unknown) => {
  const panggilan: { url: string; init: RequestInit }[] = [];
  const ambil = (async (url: string, init: RequestInit) => {
    panggilan.push({ url, init });
    return new Response(typeof isi === 'string' ? isi : JSON.stringify(isi), { status });
  }) as unknown as typeof fetch;
  return { panggilan, pengirim: new PengirimSmsZenziva('uk', 'pk', 'https://zenziva.test/masking/api/sendsms/', ambil) };
};

test('req_6_6 Zenziva menerima POST JSON berisi kunci, nomor, dan teks; status "1" berarti terkirim', async () => {
  const { panggilan, pengirim } = zenzivaPalsu(200, { messageId: '157365', to: '081234567890', status: '1', text: 'Success' });
  await pengirim.kirim('081234567890', 'Nomor tiket Anda ESK-20261115-0001.');
  assert.equal(panggilan.length, 1);
  assert.equal(panggilan[0].url, 'https://zenziva.test/masking/api/sendsms/');
  assert.equal(panggilan[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(panggilan[0].init.body)), { userkey: 'uk', passkey: 'pk', to: '081234567890', message: 'Nomor tiket Anda ESK-20261115-0001.' });
});

test('req_6_6 Zenziva menolak atau tak terjangkau menjadi galat tanpa nomor tujuan dan tanpa kunci', async () => {
  const ditolak = zenzivaPalsu(200, { status: '0', text: 'Saldo tidak cukup' });
  await assert.rejects(ditolak.pengirim.kirim('081234567890', 'x'), (e: Error) => e.message === 'Zenziva menolak: Saldo tidak cukup');
  await assert.rejects(zenzivaPalsu(500, 'bukan json').pengirim.kirim('081234567890', 'x'), /Zenziva menolak: HTTP 500/);
  const putus = new PengirimSmsZenziva('uk', 'pk', 'https://zenziva.test/', (async () => { throw new TypeError('network'); }) as unknown as typeof fetch);
  await assert.rejects(putus.kirim('081234567890', 'x'), (e: Error) => !/0812|uk|pk/.test(e.message) && /tidak dapat dihubungi/.test(e.message));
});

test('req_6_6 Zenziva tidak menjawab dalam batas waktu atau balasan 2xx tak terbaca: hasil tidak pasti', async () => {
  const lambat = new PengirimSmsZenziva('uk', 'pk', 'https://zenziva.test/', (async () => {
    throw new DOMException('signal timed out', 'TimeoutError');
  }) as unknown as typeof fetch);
  await assert.rejects(lambat.kirim('081234567890', 'x'), GalatSmsTidakPasti);
  await assert.rejects(zenzivaPalsu(200, '<html>ok</html>').pengirim.kirim('081234567890', 'x'), GalatSmsTidakPasti);
  await assert.rejects(zenzivaPalsu(502, 'bukan json').pengirim.kirim('081234567890', 'x'),
    (e: Error) => !(e instanceof GalatSmsTidakPasti) && /HTTP 502/.test(e.message));
});

test('req_6_6 ZENZIVA_URL selain https ditolak agar kunci tidak terkirim tanpa enkripsi', () => {
  const env: Record<string, string> = { ZENZIVA_USERKEY: 'uk', ZENZIVA_PASSKEY: 'pk', ZENZIVA_URL: 'http://console.zenziva.net/masking/api/sendsms/' };
  assert.throws(() => buatPengirimSms('zenziva', (n) => env[n]), /harus diawali https/);
});

const androidPalsu = (status: number, isi: unknown) => {
  const panggilan: { url: string; init: RequestInit }[] = [];
  const ambil = (async (url: string, init: RequestInit) => {
    panggilan.push({ url, init });
    return new Response(typeof isi === 'string' ? isi : JSON.stringify(isi), { status });
  }) as unknown as typeof fetch;
  return { panggilan, pengirim: new PengirimSmsAndroid('usr', 'rahasia', 'https://smsgate.test/3rdparty/v1/messages', ambil) };
};

test('req_6_6 SMS Gateway Android menerima POST JSON dengan Basic auth dan nomor E.164; 2xx berarti masuk antrean HP', async () => {
  const { panggilan, pengirim } = androidPalsu(202, { id: 'abc', state: 'Pending' });
  await pengirim.kirim('081234567890', 'Nomor tiket Anda ESK-20261115-0001.');
  assert.equal(panggilan.length, 1);
  assert.equal(panggilan[0].url, 'https://smsgate.test/3rdparty/v1/messages');
  assert.equal(panggilan[0].init.method, 'POST');
  assert.equal((panggilan[0].init.headers as Record<string, string>).authorization, `Basic ${btoa('usr:rahasia')}`);
  assert.deepEqual(JSON.parse(String(panggilan[0].init.body)), {
    textMessage: { text: 'Nomor tiket Anda ESK-20261115-0001.' },
    phoneNumbers: ['+6281234567890'],
  });
});

test('req_6_6 SMS Gateway Android menolak, tak terjangkau, atau lambat: galat tanpa nomor dan tanpa kredensial', async () => {
  await assert.rejects(androidPalsu(503, { error: 'QueueLimitExceeded', message: 'queue limits exceeded: too many pending messages: 100 / 100' }).pengirim.kirim('081234567890', 'x'),
    (e: Error) => e.message === 'SMS Gateway Android menolak: HTTP 503 queue limits exceeded: too many pending messages: 100 / 100');
  await assert.rejects(androidPalsu(401, 'Unauthorized').pengirim.kirim('081234567890', 'x'), (e: Error) => e.message === 'SMS Gateway Android menolak: HTTP 401');
  const putus = new PengirimSmsAndroid('usr', 'rahasia', 'https://smsgate.test/', (async () => { throw new TypeError('network'); }) as unknown as typeof fetch);
  await assert.rejects(putus.kirim('081234567890', 'x'), (e: Error) => !/0812|usr|rahasia/.test(e.message) && /tidak dapat dihubungi/.test(e.message));
  const lambat = new PengirimSmsAndroid('usr', 'rahasia', 'https://smsgate.test/', (async () => {
    throw new DOMException('signal timed out', 'TimeoutError');
  }) as unknown as typeof fetch);
  await assert.rejects(lambat.kirim('081234567890', 'x'), GalatSmsTidakPasti);
});

test('req_6_6 SMS_ADAPTER android butuh kredensial sms-gate.app dan alamat https', () => {
  assert.throws(() => buatPengirimSms('android', () => undefined), /SMSGATE_USERNAME dan SMSGATE_PASSWORD wajib diisi/);
  const env: Record<string, string> = { SMSGATE_USERNAME: 'usr', SMSGATE_PASSWORD: 'rahasia' };
  const android = buatPengirimSms('android', (n) => env[n]);
  assert.ok(android instanceof PengirimSmsAndroid);
  assert.equal(android.url, URL_SMSGATE_BAWAAN);
  env.SMSGATE_URL = 'http://192.168.1.5:8080/message';
  assert.throws(() => buatPengirimSms('android', (n) => env[n]), /SMSGATE_URL harus diawali https/);
});

test('req_6_6 hasil kirim tidak pasti dicatat terkirim dan tidak dikirim ulang', async (t) => {
  t.mock.method(console, 'info', () => {});
  const peringatan = t.mock.method(console, 'warn', () => {});
  const antrean = antreanTiruan({ [TIKET_A]: NOMOR_A });
  let panggilan = 0;
  const controller = new PenangananController(antrean.p, {
    async kirim() {
      panggilan++;
      throw new GalatSmsTidakPasti('Zenziva tidak menjawab dalam batas waktu.');
    },
  });
  antrean.tutupTiket(TIKET_A);

  assert.deepEqual(await controller.kirimNotifikasi(), { diproses: 1, terkirim: 1, gagal: 0 });
  assert.deepEqual(await controller.kirimNotifikasi(), { diproses: 0, terkirim: 0, gagal: 0 });
  assert.equal(panggilan, 1);
  assert.equal(antrean.baris[0].status, 'terkirim');
  assert.ok(peringatan.mock.calls.every((c) => !c.arguments.join(' ').includes(NOMOR_A)), 'log tanpa nomor tujuan');
});

test('req_2_4 req_1_7 SMS nomor tiket sama persis dengan pesan yang diucapkan gateway', () => {
  assert.equal(teksSms('nomor_tiket', TIKET_A), pesanTiketPengaduan(TIKET_A));
  assert.equal(teksSms('nomor_tiket', 'ESK-20261115-0001'), pesanTiketEskalasi('ESK-20261115-0001'));
  assert.equal(teksSms('tindak_lanjut', TIKET_A), teksSmsTindakLanjut(TIKET_A));
});

test('req_2_4 notifikasi nomor tiket dikirim dengan teks nomor tiket', async (t) => {
  t.mock.method(console, 'info', () => {});
  const sms = new PengirimSmsTiruan();
  const antrean: PenyimpananNotifikasi = {
    klaimNotifikasiTertunda: async () => [{ id: 'n-1', jenis: 'nomor_tiket', noTiket: 'ESK-20261115-0001', nomorTelepon: NOMOR_A }],
    catatHasilNotifikasi: async () => {},
  };
  await new PenangananController(antrean, sms).kirimNotifikasi();
  assert.deepEqual(sms.terkirim, [{ nomorTelepon: NOMOR_A, teks: pesanTiketEskalasi('ESK-20261115-0001') }]);
});
