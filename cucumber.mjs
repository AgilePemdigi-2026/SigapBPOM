// Uji penerimaan Gherkin (ADR 0002). Skenario @live memanggil layanan luar dan @ui butuh aplikasi berjalan serta browser,
// jadi keduanya tidak ikut uji bawaan. Skenario @belum-tersedia menunggu bagian yang belum dibuat (lihat features/README.md)
// dan juga tidak ikut.
const dasar = {
  paths: ['features/**/*.feature'],
  import: ['features/support/**/*.mjs', 'features/step_definitions/**/*.mjs'],
  format: ['progress'],
};

export default { ...dasar, tags: 'not @live and not @ui and not @belum-tersedia' };

export const live = { ...dasar, tags: '@live' };

// Daftar skenario yang menunggu bagian belum dibuat; langkahnya berstatus pending.
export const belum = { ...dasar, tags: '@belum-tersedia' };

// Skenario SRS Lampiran F lewat browser terhadap dashboard dan panel suara lokal (cara menjalankan di features/README.md).
// Setiap langkah ditampilkan di terminal dan laporan HTML disimpan di test-results/bdd-ui/laporan.html sebagai bukti uji.
export const ui = {
  ...dasar,
  tags: '@ui',
  format: ['@cucumber/pretty-formatter', 'html:test-results/bdd-ui/laporan.html'],
  formatOptions: { theme: { 'feature keyword': ['magenta', 'bold'], 'scenario keyword': ['magenta'], 'step keyword': ['bold'] } },
};
