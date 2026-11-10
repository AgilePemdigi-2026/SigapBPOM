import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatPengirimSms, PengirimSmsTiruan } from '../adapter/sms.ts';
import type { HasilNotifikasi, NotifikasiDiklaim, StatusKirimNotifikasi } from '../entity/notifikasi.ts';
import {
  BATAS_PERCOBAAN_KIRIM,
  GALAT_NOMOR_TIDAK_TERSEDIA,
  PenangananController,
  type PenyimpananNotifikasi,
  teksSmsTindakLanjut,
} from './PenangananController.ts';

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
        return { id: b.id, noTiket: b.noTiket, nomorTelepon: nomorPerTiket[b.noTiket] ?? null };
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
  const ringkasan = await controller.kirimNotifikasiTindakLanjut();

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
  await controller.kirimNotifikasiTindakLanjut();

  assert.equal(baris.length, 1);
  assert.equal(sms.terkirim.length, 1);
});

test('req_6_6 gagal kirim tercatat beserta galatnya dan berhasil saat diulang', async (t) => {
  t.mock.method(console, 'info', () => {});
  const { controller, sms, baris, tutupTiket } = rakit();
  tutupTiket(TIKET_A);
  sms.gagalkan(1, 'Gateway tidak menjawab.');

  const pertama = await controller.kirimNotifikasiTindakLanjut();
  assert.deepEqual(pertama, { diproses: 1, terkirim: 0, gagal: 1 });
  assert.equal(baris[0].status, 'gagal');
  assert.equal(baris[0].galat, 'Gateway tidak menjawab.');
  assert.equal(sms.terkirim.length, 0);

  const kedua = await controller.kirimNotifikasiTindakLanjut();
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

  await controller.kirimNotifikasiTindakLanjut();
  assert.deepEqual(baris.map((b) => b.status), ['gagal', 'terkirim']);

  const ulang = await controller.kirimNotifikasiTindakLanjut();
  assert.deepEqual(ulang, { diproses: 1, terkirim: 1, gagal: 0 });
  assert.deepEqual(sms.terkirim.map((s) => s.nomorTelepon), [NOMOR_B, NOMOR_A]);
});

test('req_6_6 menjalankan ulang sesudah terkirim tidak mengirim SMS ganda', async (t) => {
  t.mock.method(console, 'info', () => {});
  const { controller, sms, tutupTiket } = rakit();
  tutupTiket(TIKET_A);

  await controller.kirimNotifikasiTindakLanjut();
  const ulang = await controller.kirimNotifikasiTindakLanjut();
  tutupTiket(TIKET_A);
  const ulangSesudahTutupLagi = await controller.kirimNotifikasiTindakLanjut();

  assert.deepEqual(ulang, { diproses: 0, terkirim: 0, gagal: 0 });
  assert.deepEqual(ulangSesudahTutupLagi, { diproses: 0, terkirim: 0, gagal: 0 });
  assert.equal(sms.terkirim.length, 1);
});

test('req_6_6 dua putaran bersamaan tidak mengirim SMS ganda', async (t) => {
  t.mock.method(console, 'info', () => {});
  const { controller, sms, tutupTiket } = rakit();
  tutupTiket(TIKET_A);
  tutupTiket(TIKET_B);

  const [a, b] = await Promise.all([controller.kirimNotifikasiTindakLanjut(), controller.kirimNotifikasiTindakLanjut()]);

  assert.equal(a.terkirim + b.terkirim, 2);
  assert.equal(sms.terkirim.length, 2);
});

test('req_6_6 notifikasi tanpa nomor tujuan tercatat gagal tanpa memanggil gateway', async (t) => {
  t.mock.method(console, 'info', () => {});
  const { controller, sms, baris, tutupTiket } = rakit({ [TIKET_A]: null });
  tutupTiket(TIKET_A);

  const ringkasan = await controller.kirimNotifikasiTindakLanjut();

  assert.deepEqual(ringkasan, { diproses: 1, terkirim: 0, gagal: 1 });
  assert.equal(baris[0].galat, GALAT_NOMOR_TIDAK_TERSEDIA);
  assert.equal(sms.terkirim.length, 0);
});

test('req_6_6 notifikasi yang terus gagal berhenti diklaim setelah batas percobaan', async (t) => {
  t.mock.method(console, 'info', () => {});
  const { controller, sms, baris, tutupTiket } = rakit();
  tutupTiket(TIKET_A);
  sms.gagalkan(BATAS_PERCOBAAN_KIRIM + 1);

  for (let i = 0; i < BATAS_PERCOBAAN_KIRIM + 1; i++) await controller.kirimNotifikasiTindakLanjut();

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

  const ringkasan = await controller.kirimNotifikasiTindakLanjut();

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

test('req_6_6 adapter SMS bawaan adalah tiruan dan mode resmi ditolak sampai gateway dipilih', () => {
  assert.ok(buatPengirimSms(undefined) instanceof PengirimSmsTiruan);
  assert.ok(buatPengirimSms('tiruan') instanceof PengirimSmsTiruan);
  assert.throws(() => buatPengirimSms('resmi'), /belum tersedia/);
});
