import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teruskanKeGateway } from './proxyVoice.ts';

function fetchTiruan(balasan: Response) {
  const dipanggil: { url: string; init: RequestInit }[] = [];
  const f = (async (url: URL | string, init?: RequestInit) => {
    dipanggil.push({ url: String(url), init: init ?? {} });
    return balasan;
  }) as typeof fetch;
  return { f, dipanggil };
}

test('POST /voice/giliran diteruskan dengan path, query, origin, dan alamat klien; cookie tidak ikut', async () => {
  const { f, dipanggil } = fetchTiruan(new Response('{"a":1}\n', { status: 200, headers: { 'content-type': 'application/x-ndjson', 'content-length': '8' } }));
  const req = new Request('https://sigapbpom.caiis.ai.id/voice/giliran?id=abc', {
    method: 'POST', body: '{"teks":"halo"}',
    headers: { 'content-type': 'application/json', origin: 'https://sigapbpom.caiis.ai.id', cookie: 'sesi=rahasia' },
  });
  const res = await teruskanKeGateway(req, { gatewayUrl: 'https://vps.example.id/', ipKlien: '198.51.100.7', kunciProxy: 'k', fetch: f });
  assert.equal(dipanggil[0].url, 'https://vps.example.id/voice/giliran?id=abc');
  const h = new Headers(dipanggil[0].init.headers);
  assert.equal(h.get('origin'), 'https://sigapbpom.caiis.ai.id');
  assert.equal(h.get('x-sigap-ip-klien'), '198.51.100.7');
  assert.equal(h.get('x-sigap-kunci-proxy'), 'k');
  assert.equal(h.get('cookie'), null);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/x-ndjson');
  assert.equal(res.headers.get('content-length'), null);
  assert.equal(await res.text(), '{"a":1}\n');
});

test('tanpa kunci proxy alamat klien tetap dikirim tanpa header kunci; GET tanpa body', async () => {
  const { f, dipanggil } = fetchTiruan(new Response(null, { status: 404 }));
  const res = await teruskanKeGateway(new Request('http://x/voice/statis/menu'), { gatewayUrl: 'http://gw:8090', ipKlien: '1.1.1.1', fetch: f });
  const h = new Headers(dipanggil[0].init.headers);
  assert.equal(h.get('x-sigap-ip-klien'), '1.1.1.1');
  assert.equal(h.get('x-sigap-kunci-proxy'), null);
  assert.equal(dipanggil[0].init.body, undefined);
  assert.equal(res.status, 404);
});

test('gateway tidak terjangkau menghasilkan 502 dengan pesan umum', async () => {
  const f = (async () => { throw new Error('ECONNREFUSED'); }) as typeof fetch;
  const res = await teruskanKeGateway(new Request('http://x/voice/akhiri', { method: 'POST', body: '{}' }), { gatewayUrl: 'http://gw', ipKlien: '', fetch: f });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).status, 'error');
});
