import test from 'node:test';
import assert from 'node:assert/strict';
import { LaporanController, PESAN_LAPORAN, daftarPeriode } from './LaporanController.ts';
import { PenyimpananLaporanSupabase } from './penyimpananLaporanSupabase.ts';
import { PenyimpananLaporanTiruan } from './mock/laporanTiruan.ts';
import { pilihPenyimpanan } from './laporan.ts';

const SEPTEMBER = { awal: '2026-09-01', akhir: '2026-09-30' };
const ENV = { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: 'kunci-anon' };

/** Klien Supabase palsu: mencatat setiap panggilan RPC dan menjawab dengan balasan per nama RPC. */
function supabasePalsu(balasan: Record<string, () => Response>) {
  const dipanggil: { url: string; headers: Record<string, string>; body: unknown }[] = [];
  const fetchPalsu = (async (url: string, init: RequestInit) => {
    dipanggil.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return balasan[url.split('/rpc/')[1]]?.() ?? new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  const kontrol = new LaporanController(new PenyimpananLaporanSupabase({ url: 'http://sb/', kunciPublik: 'anon', tokenAkses: 'token-petugas', fetch: fetchPalsu }));
  return { kontrol, dipanggil };
}

const minggu = (awal: string, akhir: string, panggilan: number, tereskalasi: number, pengaduan_selesai: number) => ({ awal, akhir, panggilan, tereskalasi, pengaduan_selesai });

test('req_8_1 rekap mengikuti hasil RPC rekap_layanan apa adanya, dipanggil dengan token petugas', async () => {
  const { kontrol, dipanggil } = supabasePalsu({
    rekap_layanan: () =>
      Response.json({
        // Total sengaja tidak sama dengan jumlah per minggu: control tidak boleh menghitung ulang.
        total: { panggilan: 2148, tereskalasi: 163, pengaduan_selesai: 97 },
        per_minggu: [minggu('2026-09-01', '2026-09-07', 512, 39, 22), minggu('2026-09-08', '2026-09-14', 498, 36, 24)],
      }),
  });

  const rekap = await kontrol.hitungRekap(SEPTEMBER);

  assert.deepEqual(rekap, {
    total: { panggilan: 2148, tereskalasi: 163, pengaduanSelesai: 97 },
    perMinggu: [
      { awal: '2026-09-01', akhir: '2026-09-07', panggilan: 512, tereskalasi: 39, pengaduanSelesai: 22 },
      { awal: '2026-09-08', akhir: '2026-09-14', panggilan: 498, tereskalasi: 36, pengaduanSelesai: 24 },
    ],
  });
  assert.equal(dipanggil.length, 1);
  assert.equal(dipanggil[0].url, 'http://sb/rest/v1/rpc/rekap_layanan');
  assert.deepEqual(dipanggil[0].body, { p_awal: '2026-09-01', p_akhir: '2026-09-30' });
  assert.equal(dipanggil[0].headers.Authorization, 'Bearer token-petugas');
  assert.equal(dipanggil[0].headers.apikey, 'anon');
});

test('req_8_2 periode tanpa data dari RPC menampilkan pesan kamus', async () => {
  const { kontrol } = supabasePalsu({
    rekap_layanan: () => Response.json({ total: { panggilan: 0, tereskalasi: 0, pengaduan_selesai: 0 }, per_minggu: [minggu('2025-01-01', '2025-01-07', 0, 0, 0)] }),
  });
  assert.deepEqual(await kontrol.hitungRekap({ awal: '2025-01-01', akhir: '2025-01-31' }), { kosong: 'Data tidak tersedia pada periode tersebut.' });
  assert.equal(PESAN_LAPORAN.periodeKosong, 'Data tidak tersedia pada periode tersebut.');
});

test('req_8_2 RPC rekap yang gagal tidak ditutupi menjadi periode kosong', async () => {
  const { kontrol } = supabasePalsu({ rekap_layanan: () => new Response('{}', { status: 500 }) });
  await assert.rejects(kontrol.hitungRekap(SEPTEMBER), /Supabase 500 pada rpc\/rekap_layanan/);
});

test('req_8_3 br_8 nfr_14 petugas tanpa hak ekspor ditolak dengan pesan kamus', async () => {
  const { kontrol, dipanggil } = supabasePalsu({ boleh_ekspor: () => Response.json(false) });
  assert.deepEqual(await kontrol.periksaHakEkspor(), { boleh: false, pesan: 'Anda tidak memiliki hak akses ekspor data.' });
  assert.equal(dipanggil[0].url, 'http://sb/rest/v1/rpc/boleh_ekspor');
  assert.equal(dipanggil[0].headers.Authorization, 'Bearer token-petugas');
});

test('req_8_3 br_8 hak ekspor yang gagal diperiksa dianggap tidak berhak', async () => {
  const { kontrol } = supabasePalsu({});
  assert.deepEqual(await kontrol.periksaHakEkspor(), { boleh: false, pesan: PESAN_LAPORAN.tanpaHakEkspor });
});

test('req_8_3 petugas berhak ekspor mendapat pilihan format', async () => {
  const { kontrol } = supabasePalsu({ boleh_ekspor: () => Response.json(true) });
  assert.deepEqual(await kontrol.periksaHakEkspor(), { boleh: true });
});

test('br_8 nfr_14 sesi Supabase memakai RPC dengan token petugas; tiruan tidak memberi hak ekspor di produksi', async () => {
  const supabase = pilihPenyimpanan('token-petugas', ENV, true);
  assert.ok(supabase instanceof PenyimpananLaporanSupabase);
  assert.equal(supabase.tokenAkses, 'token-petugas');
  assert.ok(pilihPenyimpanan('token-petugas', {}, false) instanceof PenyimpananLaporanTiruan);
  assert.equal(await pilihPenyimpanan(undefined, ENV, true).bolehEkspor(), false);
  assert.equal(await pilihPenyimpanan(undefined, ENV, false).bolehEkspor(), true);
});

test('req_8_2 pilihan Periode per bulan kalender WIB dengan label seperti SRS Tabel B.9', () => {
  // 30 September 18.00 UTC sudah 1 Oktober di WIB.
  const periode = daftarPeriode(new Date('2026-09-30T18:00:00Z'));
  assert.deepEqual(periode[0], { nilai: '2026-10', label: '01-10-2026 s.d. 31-10-2026', awal: '2026-10-01', akhir: '2026-10-31' });
  assert.ok(periode.some((p) => p.label === '01-09-2026 s.d. 30-09-2026' && p.akhir === '2026-09-30'));
  assert.equal(periode.find((p) => p.nilai === '2026-02')?.akhir, '2026-02-28');
  assert.deepEqual(periode.at(-1), { nilai: '2025-01', label: '01-01-2025 s.d. 31-01-2025', awal: '2025-01-01', akhir: '2025-01-31' });
});

test('req_8_2 rekap tiruan: Januari 2025 kosong, September 2026 dirinci per tujuh hari', async () => {
  const kontrol = new LaporanController(new PenyimpananLaporanTiruan());
  assert.deepEqual(await kontrol.hitungRekap({ awal: '2025-01-01', akhir: '2025-01-31' }), { kosong: PESAN_LAPORAN.periodeKosong });

  const rekap = await kontrol.hitungRekap(SEPTEMBER);
  assert.ok('total' in rekap);
  assert.deepEqual(
    rekap.perMinggu.map((m) => `${m.awal}/${m.akhir}`),
    ['2026-09-01/2026-09-07', '2026-09-08/2026-09-14', '2026-09-15/2026-09-21', '2026-09-22/2026-09-28', '2026-09-29/2026-09-30'],
  );
  assert.equal(rekap.total.panggilan, rekap.perMinggu.reduce((n, m) => n + m.panggilan, 0));
  assert.ok(rekap.total.panggilan > 0);
});
