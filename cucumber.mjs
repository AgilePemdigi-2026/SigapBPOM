// Uji penerimaan Gherkin (ADR 0002). Skenario @live memanggil layanan luar dan tidak ikut uji bawaan.
export default {
  paths: ['features/**/*.feature'],
  import: ['features/step_definitions/**/*.mjs'],
  tags: 'not @live',
  format: ['progress'],
};

export const live = { ...{ paths: ['features/**/*.feature'], import: ['features/step_definitions/**/*.mjs'], format: ['progress'] }, tags: '@live' };
