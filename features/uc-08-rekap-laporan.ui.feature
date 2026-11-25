# Skenario penerimaan UC-08 dari SRS Lampiran F, Tabel B.9, dijalankan lewat browser (`npm run test:bdd:ui`).
# Background menuliskan prasyarat UC-08 (petugas berhak ekspor sudah login, ada data layanan September 2026) yang di SRS
# tersirat. Periode Januari 2025 sengaja tanpa data.
@ui @uc-08
Feature: Service Recapitulation and Report

  Background:
    Given I am logged in as a HaloBPOM officer
    And there is service data in September 2026

  Scenario: Service recapitulation is displayed (Basic Path)
    Given I am on the "/rekap-laporan" page
    When I select "01-09-2026 s.d. 30-09-2026" from "Periode"
    And I press "Tampilkan"
    Then I should see the "TabelRekapitulasi" element
    And I should see the "GrafikRekapitulasi" element

  Scenario: Report file is downloaded (Basic Path)
    Given I am on the "/rekap-laporan" page
    And the service recapitulation is displayed
    When I press "Unduh Laporan"
    Then I should see the "PilihanFormatBerkas" element
    When I select "PDF" from "Format Berkas"
    And I press "Konfirmasi Unduh"
    Then I should see the message "Laporan berhasil diunduh."

  Scenario: Selected period has no data (Alternative Path 1)
    Given I am on the "/rekap-laporan" page
    When I select "01-01-2025 s.d. 31-01-2025" from "Periode"
    And I press "Tampilkan"
    Then I should see the message "Data tidak tersedia pada periode tersebut."

  Scenario: Officer does not have export permission (Exception Path 1)
    Given I am logged in as an officer without export permission
    And I am on the "/rekap-laporan" page
    And the service recapitulation is displayed
    When I press "Unduh Laporan"
    Then I should see the message "Anda tidak memiliki hak akses ekspor data."
