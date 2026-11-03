# Skenario penerimaan UC-07 dari SRS Lampiran F, Tabel B.8, dijalankan lewat browser (`npm run test:bdd:ui`).
# Background menuliskan prasyarat UC-07 (petugas sudah login, materi usang yang akan dihapus ada) yang di SRS tersirat.
@ui @uc-07
Feature: Knowledge Base Management

  Background:
    Given I am logged in as a HaloBPOM officer
    And the material "Ketentuan Label Pangan Olahan 2018" exists

  Scenario: New material is saved and ready to use (Basic Path)
    Given I am on the "/basis-pengetahuan" page
    When I press "Tambah Materi"
    Then I should see the "FormulirMateri" element
    When I fill in "Judul Materi" with "Ketentuan Izin Edar Suplemen Kesehatan"
    And I fill in "Rujukan Sumber" with "Peraturan BPOM Nomor 17 Tahun 2019"
    And I press "Simpan"
    Then I should see the message "Materi siap digunakan sistem."

  Scenario: Obsolete material is deleted (Alternative Path 1)
    Given I am on the "/basis-pengetahuan" page
    When I press "Hapus" on the material "Ketentuan Label Pangan Olahan 2018"
    Then I should see the message "Materi ditandai tidak aktif."

  Scenario: Material relation is inspected on the knowledge graph (Alternative Path 2)
    Given I am on the "/basis-pengetahuan" page
    When I press "Graf Pengetahuan"
    Then I should see the "GrafPengetahuan" element
    When I press "Suplemen Kesehatan" on the graph
    Then I should see the "BagianDokumenTerindeks" element

  Scenario: Material is saved without a reference source (Exception Path 1)
    Given I am on the "/basis-pengetahuan" page
    When I press "Tambah Materi"
    And I fill in "Judul Materi" with "Ketentuan Izin Edar Suplemen Kesehatan"
    And I fill in "Rujukan Sumber" with ""
    And I press "Simpan"
    Then I should see the message "Rujukan sumber wajib diisi."
