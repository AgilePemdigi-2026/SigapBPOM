# Skenario penerimaan REQ-4.5 (T-F5.5-06): petugas berhak memilih provider AI di Pantau AI Agent, dijalankan lewat browser
# (`npm run test:bdd:ui`). Kesehatan AI Lokal dibaca dari Voice Gateway tiruan, jadi dashboard dijalankan dengan
# VOICE_GATEWAY_URL=http://127.0.0.1:8091 (features/README.md). Skenario tanpa hak butuh Supabase lokal.
@ui @uc-04 @REQ-4.5
Feature: AI Provider Selection (REQ-4.5)

  Background:
    Given I am logged in as a HaloBPOM officer
    And the AI provider is "Cloud (GPT)"
    And the local AI device is running

  Scenario: Authorized officer switches to the local AI (REQ-4.5 Basic Path)
    Given I am on the "/pantau-ai-agent" page
    When I choose "Lokal (Ollama)" in the "PanelProviderAi" element
    And I press "Simpan"
    Then I should see the message "Provider AI berhasil diubah."
    When I go to "/pantau-ai-agent"
    Then "Lokal (Ollama)" should be the selected AI provider

  Scenario: Officer without the right sees the options disabled (REQ-4.5 Alternative Path 1)
    Given I do not have the right to change the AI provider
    When I go to "/pantau-ai-agent"
    Then the AI provider options should be disabled
    And I should see the message "Anda tidak memiliki hak mengubah provider AI."

  Scenario: Choosing Lokal while the local device is down asks for confirmation (REQ-4.5 Alternative Path 2)
    Given the local AI device is down
    And I am on the "/pantau-ai-agent" page
    When I choose "Lokal (Ollama)" in the "PanelProviderAi" element
    And I press "Simpan"
    Then I should be asked "Perangkat AI lokal sedang tidak aktif. Selama mode Lokal dipakai, panggilan akan diteruskan ke petugas. Lanjutkan?"
    And I should see the message "Provider AI berhasil diubah."
