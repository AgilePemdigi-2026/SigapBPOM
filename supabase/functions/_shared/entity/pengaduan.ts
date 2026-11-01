// Entity UC-02: berkas pengaduan produk masyarakat (T-F4.2-01, REQ-2.3, BR-1).

export interface Pengaduan {
  id: string;
  percakapanId: string;
  tiketId?: string | null;
  namaProduk: string;
  kronologi: string;
  namaPelapor: string;
  nomorTelepon: string;
  kelengkapan: boolean;
  tglPengaduan: string;
}
