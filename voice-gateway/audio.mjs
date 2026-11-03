// Pengiriman audio MP3 dengan dukungan HTTP Range. Safari (iPhone, macOS) memutar media hanya bila server menjawab
// permintaan Range: ia meminta bytes=0-1 lebih dulu lalu sisanya, sehingga audio harus bisa diambil lebih dari sekali.

/** Rentang byte dari header Range satu bagian untuk berkas `panjang` byte: {awal, akhir}, 'salah' bila tidak terpenuhi, atau null. */
export function rentangByte(header, panjang) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? '').trim());
  if (!m || (!m[1] && !m[2])) return null;
  let awal, akhir;
  if (!m[1]) {
    // bytes=-N: N byte terakhir.
    awal = Math.max(0, panjang - Number(m[2]));
    akhir = panjang - 1;
  } else {
    awal = Number(m[1]);
    akhir = m[2] ? Math.min(Number(m[2]), panjang - 1) : panjang - 1;
  }
  return awal > akhir || awal >= panjang ? 'salah' : { awal, akhir };
}

export function kirimAudio(req, res, audio, cacheControl) {
  const kepala = { 'content-type': 'audio/mpeg', 'cache-control': cacheControl, 'accept-ranges': 'bytes' };
  const r = rentangByte(req.headers.range, audio.length);
  if (r === 'salah') {
    res.writeHead(416, { ...kepala, 'content-range': `bytes */${audio.length}` });
    return res.end();
  }
  if (!r) {
    res.writeHead(200, { ...kepala, 'content-length': audio.length });
    return res.end(audio);
  }
  res.writeHead(206, { ...kepala, 'content-range': `bytes ${r.awal}-${r.akhir}/${audio.length}`, 'content-length': r.akhir - r.awal + 1 });
  res.end(audio.subarray(r.awal, r.akhir + 1));
}
