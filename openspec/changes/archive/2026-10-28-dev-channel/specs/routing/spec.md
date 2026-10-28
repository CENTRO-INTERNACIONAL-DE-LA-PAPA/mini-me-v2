# Spec Delta

## MODIFIED Requirements

### Requirement: Confidence threshold setting
Settings SHALL have a confidence threshold between 0 and 1, default 0.5, stored with the
app settings. It SHALL apply to Jev's `mini_me` answer and to its `reaction` answer. It SHALL
be shown, as "[DEBUG] Jev's confidence threshold" in Settings → General, only while
Developer mode is on, and its saved
value SHALL apply whether Developer mode is on or off.

#### Scenario: Changing the threshold
- **WHEN** the user sets the threshold to 0.8 and Jev chooses a Mini-Me with confidence 0.7
- **THEN** Assistant answers

#### Scenario: Developer mode off
- **WHEN** the threshold is 0.8 and the user turns Developer mode off
- **THEN** the threshold is no longer shown in Settings, and a Mini-Me Jev chooses with
  confidence 0.7 still does not answer
