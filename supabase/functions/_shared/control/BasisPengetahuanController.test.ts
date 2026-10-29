import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PenyediaEmbeddingMock, type PenyediaEmbedding } from '../adapter/embedding.ts';
import type { PenyimpananPengetahuan } from '../adapter/penyimpananPengetahuan.ts';
import type { MateriPengetahuan, MateriPotongan } from '../entity/materi.ts';
import {
  BasisPengetahuanController,
  PESAN_JUDUL_KOSONG,
  PESAN_RUJUKAN_KOSONG,
  potongTeks,
} from './BasisPengetahuanController.ts';
import { ErrorSigap } from './InformasiProdukController.ts';

function penyimpananPengetahuanTiruan() {
  const materiList: MateriPengetahuan[] = [];
  const potonganList: Omit<MateriPotongan, 'id'>[] = [];
  let idCounter = 1;

  const penyimpanan: PenyimpananPengetahuan = {
    async simpanMateri(m) {
      const data: MateriPengetahuan = {
        id: `00000000-0000-0000-0000-${String(idCounter++).padStart(12, '0')}`,
        ...m,
      };
      materiList.push(data);
      return { ...data };
    },
    async simpanPotongan(p) {
      potonganList.push(...p);
    },
    async perbaruiStatusTerindeks(id, terindeks) {
      const target = materiList.find((x) => x.id === id);
      if (target) target.terindeks = terindeks;
    },
  };

  return { penyimpanan, materiList, potonganList };
}

const buat = (penyedia: PenyediaEmbedding = new PenyediaEmbeddingMock()) => {
  const db = penyimpananPengetahuanTiruan();
  return { ...db, c: new BasisPengetahuanController(penyedia, db.penyimpanan) };
};

test('req_7_2 br_4 materi tanpa rujukan sumber ditolak dengan pesan "Rujukan sumber wajib diisi."', async () => {
  const { c, materiList } = buat();
  await assert.rejects(
    c.tambahMateri({ judul: 'Cara Membaca Label', rujukan: '' }),
    (e: unknown) => e instanceof ErrorSigap && e.status === 422 && e.message === PESAN_RUJUKAN_KOSONG,
  );
  await assert.rejects(
    c.tambahMateri({ judul: 'Cara Membaca Label', rujukan: '   ' }),
    (e: unknown) => e instanceof ErrorSigap && e.status === 422 && e.message === PESAN_RUJUKAN_KOSONG,
  );
  assert.equal(materiList.length, 0);
});

test('materi tanpa judul ditolak dengan status 422', async () => {
  const { c, materiList } = buat();
  await assert.rejects(
    c.tambahMateri({ judul: '   ', rujukan: 'Peraturan BPOM No 17' }),
    (e: unknown) => e instanceof ErrorSigap && e.status === 422 && e.message === PESAN_JUDUL_KOSONG,
  );
  assert.equal(materiList.length, 0);
});

test('req_7_1 materi lengkap tersimpan dengan status aktif, terindeks true, dan potongan tersimpan', async () => {
  const { c, materiList, potonganList } = buat();
  const hasil = await c.tambahMateri({
    judul: 'Ketentuan Izin Edar Suplemen Kesehatan',
    kategori: 'Suplemen Kesehatan',
    rujukan: 'Peraturan BPOM Nomor 17 Tahun 2019',
    isi: 'Suplemen kesehatan wajib memiliki izin edar dari BPOM sebelum diedarkan di wilayah Indonesia.',
    diperbarui_oleh: '11111111-1111-1111-1111-111111111111',
  });

  assert.equal(hasil.judul, 'Ketentuan Izin Edar Suplemen Kesehatan');
  assert.equal(hasil.rujukan_sumber, 'Peraturan BPOM Nomor 17 Tahun 2019');
  assert.equal(hasil.status, 'aktif');
  assert.equal(hasil.terindeks, true);
  assert.equal(hasil.diperbarui_oleh, '11111111-1111-1111-1111-111111111111');
  assert.ok(hasil.diperbarui_pada);

  assert.equal(materiList.length, 1);
  assert.equal(materiList[0].terindeks, true);
  assert.equal(potonganList.length, 1);
  assert.equal(potonganList[0].materi_id, hasil.id);
  assert.equal(potonganList[0].embedding.length, 1536);
});

test('bila pengindeksan gagal, materi TETAP tersimpan dengan terindeks = false', async () => {
  const penyediaGagal: PenyediaEmbedding = {
    buatEmbedding: async () => {
      throw new Error('Koneksi layanan embedding gagal');
    },
  };
  const { c, materiList, potonganList } = buat(penyediaGagal);

  const hasil = await c.tambahMateri({
    judul: 'Ketentuan Label Pangan',
    rujukan: 'Peraturan BPOM Nomor 31 Tahun 2018',
    isi: 'Label pangan olahan harus memuat informasi nama produk, daftar bahan, berat bersih, dan tanggal kedaluwarsa.',
  });

  // Materi tetap tersimpan di basis data
  assert.equal(materiList.length, 1);
  assert.equal(hasil.judul, 'Ketentuan Label Pangan');
  assert.equal(hasil.status, 'aktif');
  assert.equal(hasil.terindeks, false);
  assert.equal(materiList[0].terindeks, false);
  // Potongan tidak tersimpan karena embedding gagal
  assert.equal(potonganList.length, 0);
});

test('potongTeks memotong teks panjang dengan overlap 10-20%', () => {
  // Buat teks sepanjang 1200 karakter dengan kata-kata
  const kata = 'informasi kesehatan obat dan makanan oleh BPOM untuk masyarakat ';
  const teksPanjang = kata.repeat(20); // ~1280 karakter

  const potongan = potongTeks(teksPanjang, 500, 100);
  assert.ok(potongan.length >= 3, `Jumlah potongan harus >= 3, didapat ${potongan.length}`);

  // Cek bahwa setiap potongan tidak kosong dan tidak melebihi batas wajar
  for (const p of potongan) {
    assert.ok(p.length > 0);
    assert.ok(p.length <= 550, `Panjang potongan ${p.length} melebihi batas`);
  }

  // Teks pendek menghasilkan 1 potongan
  const pendek = potongTeks('Teks pendek di bawah 500 karakter.');
  assert.equal(pendek.length, 1);
  assert.equal(pendek[0], 'Teks pendek di bawah 500 karakter.');

  // Teks kosong menghasilkan array kosong
  assert.deepEqual(potongTeks(''), []);
  assert.deepEqual(potongTeks('   '), []);
});
