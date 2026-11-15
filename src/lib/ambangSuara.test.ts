import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AMBANG_MAKS, ambangSuara } from './ambangSuara.ts';

test('req_1_2 ruangan sepi memakai ambang minimum', () => {
  assert.equal(ambangSuara(0, 0.03, false).bicara, true);
  assert.equal(ambangSuara(0, 0.02, false).bicara, false);
});

test('req_1_2 bising ruangan menaikkan ambang sehingga bising tidak memicu rekaman, ucapan tetap terdeteksi', () => {
  let lantai = 0;
  for (let i = 0; i < 30; i++) lantai = ambangSuara(lantai, 0.02, false).lantai;
  assert.equal(ambangSuara(lantai, 0.04, false).bicara, false);
  assert.equal(ambangSuara(lantai, 0.12, false).bicara, true);
});

test('req_1_2 lantai tidak berubah selama penelepon bicara dan ambang tidak melewati batas atas', () => {
  assert.equal(ambangSuara(0.01, 0.005, true).lantai, 0.01);
  assert.equal(ambangSuara(1, AMBANG_MAKS + 0.01, false).bicara, true);
});
