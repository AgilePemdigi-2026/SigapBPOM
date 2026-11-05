# Skenario penerimaan UC-01 dari SRS Lampiran F, Tabel B.2, dijalankan lewat browser (`npm run test:bdd:ui`).
# Panel suara tidak bisa didengar browser uji: "I should hear" memeriksa kalimat agen di transkrip panel, "I say" mengetik
# ucapan di kolom ketik panel, dan nomor tiket contoh ESK-0123 dicocokkan dengan nomor tiket yang benar-benar terbit.
# Background menuliskan prasyarat yang di SRS tersirat. Data registrasi cekbpom dan jawaban AI dilayani server tiruan
# (features/support/tiruan.mjs). Materi rujukan sama dengan yang disimpan UC-07 Basic Path; jawaban AI tiruan tanpa kalimat
# Sumber, jadi Alternative Path 1 membuktikan gateway menyusun sumbernya dari basis pengetahuan (REQ-1.6, NFR-8).
# Cakupan: REQ-1.1, REQ-1.2, REQ-1.3, NFR-7 (Basic Path, Alternative Path 3), REQ-1.7, NFR-6 (Alternative Path 2),
# REQ-1.5, BR-7 (Alternative Path 4), REQ-1.8 (Exception Path 1), REQ-1.4, BR-6 (Exception Path 2), NFR-19.
@ui @uc-01
Feature: Voice Information Service

  Background:
    Given the BPOM registration data contains:
      | nama               | merek | nomor                   | status  | pendaftar                  |
      | Susu Formula Sehat | Sehat | BPOM RI MD 865009001234 | Berlaku | PT Nutrisi Sehat Indonesia |
      | Susu Formula Prima | Prima | BPOM RI MD 865009001235 | Berlaku | PT Nutrisi Prima Indonesia |
      | Susu Formula Bunda | Bunda | BPOM RI MD 865009001236 | Berlaku | PT Nutrisi Bunda Indonesia |
      | Susu Formula Ceria | Ceria | BPOM RI MD 865009001237 | Berlaku | PT Nutrisi Ceria Indonesia |
      | Susu Formula Juara | Juara | BPOM RI MD 865009001238 | Berlaku | PT Nutrisi Juara Indonesia |
    And the material "Ketentuan Izin Edar Suplemen Kesehatan" with reference "Peraturan BPOM Nomor 17 Tahun 2019" is ready to use
    And the AI agent answers:
      | pertanyaan                               | jawaban                                                             |
      | Apa syarat izin edar suplemen kesehatan? | Suplemen kesehatan wajib memiliki izin edar BPOM sebelum diedarkan. |
      | Berapa harga tiket kereta ke Jakarta?    | Pertanyaan tersebut berada di luar cakupan layanan HaloBPOM.        |

  Scenario: Product is registered and the licence is valid (Basic Path)
    Given I am on the "/homepage" page
    When I press "Telepon CS AI"
    Then I should see the "PanelPercakapanSuara" element
    And I should hear "Tekan 1 untuk informasi produk, tekan 2 untuk pengaduan."
    When I press "1"
    Then I should hear "Silakan sebutkan nama produk atau pertanyaan Anda."
    When I say "Susu Formula Sehat"
    Then I should see "Susu Formula Sehat" in the "TranskripPercakapan" element
    And I should hear "Susu Formula Sehat terdaftar dengan nomor izin edar BPOM RI MD 865009001234, status izin Berlaku."

  Scenario: Education question is answered with its reference (Alternative Path 1)
    Given I am on the "/homepage" page
    When I press "Telepon CS AI"
    Then I should see the "PanelPercakapanSuara" element
    And I should hear "Tekan 1 untuk informasi produk, tekan 2 untuk pengaduan."
    When I press "1"
    Then I should hear "Silakan sebutkan nama produk atau pertanyaan Anda."
    When I say "Apa syarat izin edar suplemen kesehatan?"
    Then I should see "Apa syarat izin edar suplemen kesehatan?" in the "TranskripPercakapan" element
    And I should hear "Suplemen kesehatan wajib memiliki izin edar BPOM sebelum diedarkan. Sumber: Peraturan BPOM Nomor 17 Tahun 2019."

  Scenario: Question is forwarded to an officer (Alternative Path 2)
    Given I am on the "/homepage" page
    When I press "Telepon CS AI"
    Then I should see the "PanelPercakapanSuara" element
    And I should hear "Tekan 1 untuk informasi produk, tekan 2 untuk pengaduan."
    When I press "1"
    Then I should hear "Silakan sebutkan nama produk atau pertanyaan Anda."
    When I say "Apakah obat batuk ini aman untuk ibu hamil?"
    Then I should see "Apakah obat batuk ini aman untuk ibu hamil?" in the "TranskripPercakapan" element
    And I should hear "Pertanyaan Anda akan diteruskan kepada petugas. Mohon sebutkan nomor telepon Anda."
    When I say "081234567890"
    Then I should hear "Nomor tiket Anda ESK-0123. Jawaban petugas akan dikirim melalui SMS."

  Scenario: Product is not found in the registration data (Alternative Path 3)
    Given I am on the "/homepage" page
    When I press "Telepon CS AI"
    Then I should see the "PanelPercakapanSuara" element
    And I should hear "Tekan 1 untuk informasi produk, tekan 2 untuk pengaduan."
    When I press "1"
    Then I should hear "Silakan sebutkan nama produk atau pertanyaan Anda."
    When I say "Krim Pemutih Instan"
    Then I should see "Krim Pemutih Instan" in the "TranskripPercakapan" element
    And I should hear "Produk tidak ditemukan pada data registrasi BPOM. Tekan 2 untuk menyampaikan pengaduan."

  Scenario: Product name matches more than one registration (Alternative Path 4)
    Given I am on the "/homepage" page
    When I press "Telepon CS AI"
    Then I should see the "PanelPercakapanSuara" element
    And I should hear "Tekan 1 untuk informasi produk, tekan 2 untuk pengaduan."
    When I press "1"
    Then I should hear "Silakan sebutkan nama produk atau pertanyaan Anda."
    When I say "Susu Formula"
    Then I should see "Susu Formula" in the "TranskripPercakapan" element
    And I should hear "Ditemukan 5 produk. Pilih salah satu: Susu Formula Sehat, Susu Formula Prima, atau Susu Formula Bunda."
    When I say "Susu Formula Sehat"
    Then I should hear "Susu Formula Sehat terdaftar dengan nomor izin edar BPOM RI MD 865009001234, status izin Berlaku."

  Scenario: Question is outside the drug and food topic (Exception Path 1)
    Given I am on the "/homepage" page
    When I press "Telepon CS AI"
    Then I should see the "PanelPercakapanSuara" element
    And I should hear "Tekan 1 untuk informasi produk, tekan 2 untuk pengaduan."
    When I press "1"
    Then I should hear "Silakan sebutkan nama produk atau pertanyaan Anda."
    When I say "Berapa harga tiket kereta ke Jakarta?"
    Then I should see "Berapa harga tiket kereta ke Jakarta?" in the "TranskripPercakapan" element
    And I should hear "Pertanyaan tersebut berada di luar cakupan layanan HaloBPOM."

  Scenario: Product name is not clearly heard (Exception Path 2)
    Given I am on the "/homepage" page
    When I press "Telepon CS AI"
    Then I should see the "PanelPercakapanSuara" element
    And I should hear "Tekan 1 untuk informasi produk, tekan 2 untuk pengaduan."
    When I press "1"
    Then I should hear "Silakan sebutkan nama produk atau pertanyaan Anda."
    When I say "Su... Formu... Seh..."
    Then I should hear "Maaf, nama produk kurang jelas. Mohon sebutkan kembali."
    When I say "Susu Formula Sehat"
    Then I should hear "Susu Formula Sehat terdaftar dengan nomor izin edar BPOM RI MD 865009001234, status izin Berlaku."
