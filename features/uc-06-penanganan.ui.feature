# Skenario penerimaan UC-06 dari SRS Lampiran F, Tabel B.7, dijalankan lewat browser (`npm run test:bdd:ui`).
# Background menuliskan prasyarat UC-06 (petugas sudah login, ada tiket pengaduan menunggu telaah) yang di SRS tersirat.
@ui @uc-06
Feature: Complaint Handling

  Background:
    Given I am logged in as a HaloBPOM officer
    And there is a complaint ticket waiting for review

  Scenario: Complaint review is saved (Basic Path)
    Given I am on the "/pengaduan" page
    When I press "Telaah" on a complaint with status "Belum Ditelaah"
    Then I should be on "/pengaduan/detail"
    And I should see the "StepperPenanganan" element
    When I select "Telaah Dokumen" from "Tindak Lanjut"
    And I fill in "Catatan Tindak Lanjut" with "Label produk tidak mencantumkan nomor izin edar."
    And I press "Simpan Telaah"
    Then I should see the message "Hasil telaah tersimpan."
    And I should see "Sedang Ditelaah" in the "StatusPengaduan" element

  Scenario: Official response is saved (Basic Path)
    Given I am on the "/pengaduan/detail" page
    And the complaint status is "Sedang Ditelaah"
    When I fill in "Tanggapan" with "Produk telah ditelaah dan pelaku usaha diberi peringatan tertulis."
    And I press "Simpan Tanggapan"
    Then I should see the message "Tanggapan tersimpan."
    And I should see "Tanggapan Disusun" in the "StatusPengaduan" element

  Scenario: Ticket is closed (Basic Path)
    Given I am on the "/pengaduan/detail" page
    And the complaint status is "Tanggapan Disusun"
    When I press "Tutup Tiket"
    Then I should see the message "Tiket ditutup."
    And I should see "Selesai" in the "StatusPengaduan" element

  Scenario: Complaint is outside BPOM authority (Alternative Path 1)
    Given I am on the "/pengaduan/detail" page
    When I select "Bukan Kewenangan BPOM" from "Tindak Lanjut"
    And I fill in "Catatan Tindak Lanjut" with "Produk berupa alat elektronik, bukan kewenangan BPOM."
    And I press "Simpan Telaah"
    Then I should see the message "Pengaduan diteruskan ke instansi lain."
    And I should see "Diteruskan ke Instansi Lain" in the "StatusPengaduan" element

  Scenario: Complaint requires a field inspection (Alternative Path 2)
    Given I am on the "/pengaduan/detail" page
    When I select "Perlu Pemeriksaan Lapangan" from "Tindak Lanjut"
    And I fill in "Catatan Tindak Lanjut" with "Perlu pemeriksaan sarana produksi."
    And I press "Simpan Telaah"
    Then I should see the "FormulirJadwalPemeriksaan" element
    When I fill in "Tanggal Pemeriksaan" with "15-10-2026"
    And I select "Balai Besar POM di Surabaya" from "Unit Pelaksana"
    And I press "Simpan Jadwal"
    Then I should see the message "Jadwal pemeriksaan tersimpan."
    And I should see "Menunggu Pemeriksaan" in the "StatusPengaduan" element

  Scenario: Closing a ticket without a saved response (Exception Path 1)
    Given I am on the "/pengaduan/detail" page
    And the complaint status is "Sedang Ditelaah"
    When I press "Tutup Tiket"
    Then I should see the message "Tiket tidak dapat ditutup. Susun tanggapan terlebih dahulu."
    And I should see "Sedang Ditelaah" in the "StatusPengaduan" element
