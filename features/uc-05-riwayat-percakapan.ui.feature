# Skenario penerimaan UC-05 dari SRS Lampiran F, Tabel B.6, dijalankan lewat browser (`npm run test:bdd:ui`).
# Background menuliskan prasyarat UC-05 (petugas sudah login, ada percakapan tercatat dengan transkrip) yang di SRS tersirat.
@ui @uc-05
Feature: Conversation Transcript Reading

  Background:
    Given I am logged in as a HaloBPOM officer
    And there is a recorded conversation with a transcript

  Scenario: Read a transcript and save an inspection note (Basic Path)
    Given I am on the "/riwayat-percakapan" page
    When I press "Lihat Transkrip"
    Then I should be on "/riwayat-percakapan/detail"
    And I should see the "TranskripPercakapan" element
    And I should see the "RingkasanPercakapan" element
    And I should see "0812****7890" in the "TranskripPercakapan" element
    When I fill in "Catatan Pemeriksaan" with "Perlu verifikasi ulang data pelapor"
    And I press "Simpan Catatan"
    Then I should see the message "Catatan pemeriksaan tersimpan."

  Scenario: Inspection note is empty (Exception Path 1)
    Given I am on the "/riwayat-percakapan/detail" page
    When I fill in "Catatan Pemeriksaan" with ""
    And I press "Simpan Catatan"
    Then I should see the message "Catatan pemeriksaan wajib diisi."
