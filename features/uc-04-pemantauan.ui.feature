# Skenario penerimaan UC-04 dari SRS Lampiran F, Tabel B.5, dijalankan lewat browser (`npm run test:bdd:ui`).
# Background menuliskan prasyarat UC-04 (petugas sudah login, ada tiket di antrean) yang di SRS tersirat.
@ui @uc-04
Feature: Service Monitoring

  Background:
    Given I am logged in as a HaloBPOM officer
    And there is a complaint ticket waiting for review

  Scenario: Service summary is displayed (Basic Path)
    Given I am logged in as a HaloBPOM officer
    When I go to "/ringkasan"
    Then I should see the "KartuStatistikLayanan" element
    And I should see the "DaftarKasusPerluTindakLanjut" element
    And I should see the "JumlahPanggilanBerjalan" element

  Scenario: Ongoing calls are listed (Basic Path)
    Given I am on the "/ringkasan" page
    And there is an active call
    When I follow "Panggilan Berjalan"
    Then I should be on "/panggilan-berjalan"
    And I should see "Durasi" in the "DaftarPanggilanAktif" element

  Scenario: Open a case from the escalation queue (Basic Path)
    Given I am on the "/ringkasan" page
    When I follow "Tiket Eskalasi"
    Then I should be on "/tiket-eskalasi"
    And I should see the "AntreanTiketEskalasi" element
    When I press "Buka Kasus"
    Then I should be on "/pengaduan/detail"
    And I should see the "DetailPengaduan" element

  Scenario: No call is currently active (Alternative Path 1)
    Given I am on the "/ringkasan" page
    And there is no active call
    When I follow "Panggilan Berjalan"
    Then I should be on "/panggilan-berjalan"
    And I should see the message "Tidak ada panggilan berjalan saat ini."
