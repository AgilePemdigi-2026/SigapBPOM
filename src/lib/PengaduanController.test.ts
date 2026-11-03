// Unit & Integration Test untuk PengaduanController dan Tombol Menu Panel Suara (T-F4.1-03, REQ-1.1, REQ-2.1, REQ-2.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PESAN_DATA_KURANG,
  PESAN_LAYANAN_1,
  PESAN_LAYANAN_2,
  PESAN_MENU,
  PESAN_PENGADUAN_TIDAK_LENGKAP,
  PengaduanController,
  VoiceGatewayHttp,
  VoiceGatewayTiruan,
  pesanTiketPengaduan,
  type HasilGiliran,
} from './PengaduanController.ts';

test('req_1_1 dan req_2_1 teks pesan baku sesuai persis dengan kamus pesan PRD-rinci Lampiran A', () => {
  assert.equal(PESAN_MENU, 'Tekan 1 untuk informasi produk, tekan 2 untuk pengaduan.');
  assert.equal(PESAN_LAYANAN_1, 'Silakan sebutkan nama produk atau pertanyaan Anda.');
  assert.equal(
    PESAN_LAYANAN_2,
    'Silakan sebutkan nama produk, kronologi kejadian, nama, dan nomor telepon Anda.',
  );
  assert.equal(PESAN_DATA_KURANG, 'Mohon sebutkan nomor telepon Anda.');
  assert.equal(
    PESAN_PENGADUAN_TIDAK_LENGKAP,
    'Panggilan berakhir. Pengaduan belum lengkap sehingga nomor tiket tidak diterbitkan.',
  );
  assert.equal(
    pesanTiketPengaduan('ADU-20261102-0001'),
    'Pengaduan Anda telah dicatat dengan nomor tiket ADU-20261102-0001. Tindak lanjut akan dikirim melalui SMS.',
  );
});

test('t_f4_1_03 kriteria 1: menekan tombol 2 mengirim pilihan pengaduan ke Voice Gateway dan transkrip menampilkan prompt pengaduan', async () => {
  const idPanggilan = '11111111-2222-3333-4444-555555555555';
  const mockGateway = new VoiceGatewayTiruan();
  const controller = new PengaduanController(mockGateway, idPanggilan);

  const hasil = await controller.pilihLayanan(2);

  // Verifikasi pilihan terkirim ke Voice Gateway
  assert.deepEqual(mockGateway.pilihanTerakhir, { idPanggilan, pilih: 2 });
  assert.equal(hasil.jawaban, PESAN_LAYANAN_2);
  assert.equal(hasil.suara, '/voice/statis/layanan-2');

  // Verifikasi transkrip langsung menampilkan prompt pengaduan
  assert.equal(controller.transkrip.length, 1);
  assert.equal(controller.transkrip[0].peran, 'sistem');
  assert.equal(controller.transkrip[0].teks, PESAN_LAYANAN_2);
  assert.equal(
    controller.transkrip[0].teks,
    'Silakan sebutkan nama produk, kronologi kejadian, nama, dan nomor telepon Anda.',
  );
});

test('t_f4_1_03 menekan tombol 1 mengirim pilihan informasi produk ke Voice Gateway dan transkrip menampilkan prompt layanan 1', async () => {
  const idPanggilan = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const mockGateway = new VoiceGatewayTiruan();
  const controller = new PengaduanController(mockGateway, idPanggilan);

  const hasil = await controller.pilihLayanan(1);

  assert.deepEqual(mockGateway.pilihanTerakhir, { idPanggilan, pilih: 1 });
  assert.equal(hasil.jawaban, PESAN_LAYANAN_1);
  assert.equal(controller.transkrip.length, 1);
  assert.equal(controller.transkrip[0].teks, PESAN_LAYANAN_1);
});

test('t_f4_1_03 kriteria 1: transkrip langsung menampilkan prompt tanya ulang data pengaduan', () => {
  const mockGateway = new VoiceGatewayTiruan();
  const controller = new PengaduanController(mockGateway);

  // REQ-2.2: Data pengaduan yang belum lengkap ditanyakan ulang ke pelapor
  const promptUlang = controller.tanganiPromptTanyaUlang();

  assert.equal(promptUlang.peran, 'sistem');
  assert.equal(promptUlang.teks, 'Mohon sebutkan nomor telepon Anda.');
  assert.equal(controller.transkrip[controller.transkrip.length - 1].teks, PESAN_DATA_KURANG);
});

test('t_f4_1_03 transkrip langsung menampilkan penerbitan nomor tiket pengaduan', () => {
  const mockGateway = new VoiceGatewayTiruan();
  const controller = new PengaduanController(mockGateway);

  const tiket = controller.tanganiTiketTerbit('ADU-20261102-0005');

  assert.equal(tiket.peran, 'sistem');
  assert.equal(tiket.tiket, 'ADU-20261102-0005');
  assert.equal(
    tiket.teks,
    'Pengaduan Anda telah dicatat dengan nomor tiket ADU-20261102-0005. Tindak lanjut akan dikirim melalui SMS.',
  );
});

test('t_f4_1_03 transkrip langsung menampilkan penutupan pengaduan tidak lengkap saat panggilan berakhir', () => {
  const mockGateway = new VoiceGatewayTiruan();
  const controller = new PengaduanController(mockGateway);

  const berakhir = controller.tanganiPanggilanBerakhirDataKurang();

  assert.equal(berakhir.peran, 'sistem');
  assert.equal(
    berakhir.teks,
    'Panggilan berakhir. Pengaduan belum lengkap sehingga nomor tiket tidak diterbitkan.',
  );
});

test('t_f4_1_03 adapter HTTP Voice Gateway mengirim payload JSON id dan pilih ke endpoint gateway', async () => {
  let urlDipanggil = '';
  let optionsDipanggil: RequestInit | undefined;

  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    urlDipanggil = String(input);
    optionsDipanggil = init;
    return new Response(
      JSON.stringify({
        status: 'success',
        message: 'OK',
        data: {
          transkrip: null,
          jawaban: PESAN_LAYANAN_2,
          suara: '/voice/statis/layanan-2',
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const adapter = new VoiceGatewayHttp({ baseUrl: 'http://test-gateway:8090/voice', fetch: fakeFetch as typeof fetch });
  const hasil = await adapter.kirimPilihan('uuid-panggilan-123', 2);

  assert.equal(urlDipanggil, 'http://test-gateway:8090/voice/giliran');
  assert.equal(optionsDipanggil?.method, 'POST');
  assert.deepEqual(JSON.parse(String(optionsDipanggil?.body)), {
    id: 'uuid-panggilan-123',
    pilih: 2,
  });
  assert.equal(hasil.jawaban, PESAN_LAYANAN_2);
});

test('t_f4_1_03 kriteria 2: tombol menu 1 dan 2 di PanelSuara.astro memiliki label aksesibel dan dapat dioperasikan via keyboard', () => {
  const panelPath = resolve(process.cwd(), 'src/components/PanelSuara.astro');
  const panelSource = readFileSync(panelPath, 'utf8');

  // 1. Memeriksa keberadaan tombol angka 1 dan 2 bertipe button dengan label aksesibel
  assert.match(
    panelSource,
    /<button data-pick="1" type="button" aria-label="1: Informasi Produk/,
    'Tombol 1 harus memiliki type="button" dan aria-label yang menjelaskan Informai Produk',
  );
  assert.match(
    panelSource,
    /<button data-pick="2" type="button" aria-label="2: Pengaduan Produk/,
    'Tombol 2 harus memiliki type="button" dan aria-label yang menjelaskan Pengaduan Produk',
  );

  // 2. Memeriksa group role semantik untuk menu pilihan layanan
  assert.match(
    panelSource,
    /role="group"\s+aria-label="Pilihan menu layanan"/,
    'Kontainer menu harus memiliki role="group" dan label aksesibel',
  );

  // 3. Memeriksa fokus keyboard terlihat (CSS :focus-visible)
  assert.match(
    panelSource,
    /\.ps-tr :global\(\.m-menu button:focus-visible\)\s*\{\s*outline:\s*3px\s+solid/,
    'Tombol menu harus memiliki styling fokus terlihat (:focus-visible)',
  );

  // 4. Memeriksa penanganan keyboard (angka 1, 2, Escape, serta tombol standar Enter/Space pada button)
  assert.match(
    panelSource,
    /e\.key === '1' \|\| e\.key === '2'/,
    'Mendukung shortcut tombol 1 dan 2 dari keyboard',
  );
  assert.match(
    panelSource,
    /data-pick/,
    'Event delegasi klik (yang dipicu juga oleh Enter/Space pada elemen <button>) aktif',
  );
});

