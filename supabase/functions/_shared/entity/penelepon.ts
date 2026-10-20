// Entity UC-01/UC-02: nomor telepon penelepon format Indonesia (T-F1.4-02).

// `08…` atau `+628…`, 10–13 digit setelah dinormalkan ke awalan 0.
const POLA_NOMOR_TELEPON = /^08\d{8,11}$/;

/** Mengembalikan nomor dalam bentuk `08…`, atau null bila formatnya tidak valid. */
export function normalkanNomorTelepon(masukan: string): string | null {
  const nomor = masukan.replace(/[\s-]/g, '').replace(/^\+62/, '0');
  return POLA_NOMOR_TELEPON.test(nomor) ? nomor : null;
}
