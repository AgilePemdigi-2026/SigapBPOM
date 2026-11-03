# Skenario penerimaan UC-03 dari SRS Lampiran F, Tabel B.4, dijalankan lewat browser (`npm run test:bdd:ui`).
# Akun petugas@halobpom.go.id ada di supabase/seed.sql khusus Supabase lokal.
@ui @uc-03
Feature: Officer Dashboard Login

  Scenario: Login success (Basic Path)
    Given I am on the "/login" page
    When I fill in "Email" with "petugas@halobpom.go.id"
    And I fill in "Password" with "halobpom2026"
    And I press "Login"
    Then I should be on "/ringkasan"
    And I should see the message "Login berhasil!"

  Scenario: Failed login with empty fields (Exception Path 1)
    Given I am on the "/login" page
    When I fill in "Email" with ""
    And I fill in "Password" with ""
    And I press "Login"
    Then I should see the message "Login gagal. Semua field harus diisi!"
    And I should be on "/login"

  Scenario: Failed login with wrong credentials (Exception Path 2)
    Given I am on the "/login" page
    When I fill in "Email" with "petugas@halobpom.go.id"
    And I fill in "Password" with "salahpassword"
    And I press "Login"
    Then I should see the message "Login gagal. Email atau password Anda salah."
    And I should be on "/login"

  Scenario: Access is locked after three failed attempts (Exception Path 3)
    Given I am on the "/login" page
    And I have failed to log in two times in a row
    When I fill in "Email" with "petugas@halobpom.go.id"
    And I fill in "Password" with "salahpassword"
    And I press "Login"
    Then I should see the message "Akses dikunci sementara. Hubungi administrator."
    And I should be on "/login"
