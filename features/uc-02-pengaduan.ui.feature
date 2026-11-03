# Skenario penerimaan UC-02 dari SRS Lampiran F, Tabel B.3, dijalankan lewat browser (`npm run test:bdd:ui`).
# Panel suara tidak bisa didengar browser uji: "I should hear" memeriksa kalimat agen di transkrip panel, "I say" mengetik
# ucapan di kolom ketik panel, dan nomor tiket contoh ADU-0456 dicocokkan dengan nomor tiket yang benar-benar terbit.
@ui @uc-02
Feature: Voice Complaint Submission

  Scenario: Complete complaint receives a ticket number (Basic Path)
    Given I am on the "/homepage" page
    When I press "Telepon CS AI"
    Then I should see the "PanelPercakapanSuara" element
    And I should hear "Tekan 1 untuk informasi produk, tekan 2 untuk pengaduan."
    When I press "2"
    Then I should hear "Silakan sebutkan nama produk, kronologi kejadian, nama, dan nomor telepon Anda."
    When I say "Krim Wajah Glowing membuat kulit saya iritasi setelah dua hari pemakaian. Nama saya Budi Santoso, nomor telepon 081234567890."
    Then I should see "Krim Wajah Glowing" in the "TranskripPercakapan" element
    And I should hear "Pengaduan Anda telah dicatat dengan nomor tiket ADU-0456. Tindak lanjut akan dikirim melalui SMS."

  Scenario: Missing complaint data is asked again (Alternative Path 1)
    Given I am on the "/homepage" page
    When I press "Telepon CS AI"
    Then I should see the "PanelPercakapanSuara" element
    And I should hear "Tekan 1 untuk informasi produk, tekan 2 untuk pengaduan."
    When I press "2"
    Then I should hear "Silakan sebutkan nama produk, kronologi kejadian, nama, dan nomor telepon Anda."
    When I say "Krim Wajah Glowing membuat kulit saya iritasi. Nama saya Budi Santoso."
    Then I should see "Krim Wajah Glowing" in the "TranskripPercakapan" element
    And I should hear "Mohon sebutkan nomor telepon Anda."
    When I say "081234567890"
    Then I should hear "Pengaduan Anda telah dicatat dengan nomor tiket ADU-0456. Tindak lanjut akan dikirim melalui SMS."

  Scenario: Call ends before the complaint data is complete (Exception Path 1)
    Given I am on the "/homepage" page
    When I press "Telepon CS AI"
    Then I should see the "PanelPercakapanSuara" element
    And I should hear "Tekan 1 untuk informasi produk, tekan 2 untuk pengaduan."
    When I press "2"
    Then I should hear "Silakan sebutkan nama produk, kronologi kejadian, nama, dan nomor telepon Anda."
    When I say "Krim Wajah Glowing membuat kulit saya iritasi."
    Then I should see "Krim Wajah Glowing" in the "TranskripPercakapan" element
    When I press "Akhiri Panggilan"
    Then I should see the message "Panggilan berakhir. Pengaduan belum lengkap sehingga nomor tiket tidak diterbitkan."
