import { BasisPengetahuanController } from './BasisPengetahuanController.ts';
import { PenyimpananMateriTiruan } from './mock/materiTiruan.ts';

/** Instans penyimpanan materi mock untuk pengembangan lokal dan pengujian. */
export const penyimpananMateriTiruan = new PenyimpananMateriTiruan();

/** Instans controller basis pengetahuan tunggal. */
export const basisPengetahuan = new BasisPengetahuanController(penyimpananMateriTiruan);
