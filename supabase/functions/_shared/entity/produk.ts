// Entity UC-01: data registrasi produk dari cekbpom (REQ-1.3).

export const STATUS_IZIN = ['Berlaku', 'Tidak Berlaku', 'Dibatalkan'] as const;
export type StatusIzin = (typeof STATUS_IZIN)[number];

export type Produk = {
  nama: string;
  nomorIzinEdar: string;
  status: StatusIzin;
  pendaftar: string;
  sumber: string;
};
