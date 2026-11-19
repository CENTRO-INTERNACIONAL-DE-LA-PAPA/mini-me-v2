# Spec Delta

## MODIFIED Requirements

### Requirement: Avatars blink and breathe while idle
An avatar SHALL blink now and then with the shapes its eyes part marks for blinking; eyes with
no such shapes, such as closed eyes or eyes drawn as lines or arcs, SHALL NOT blink. An avatar
of 40 px or more SHALL also rise and fall gently as it breathes. Avatars shown together SHALL
blink and breathe out of step, not all at once.

#### Scenario: A face with open eyes
- **WHEN** Scribe, whose "normal" eyes are round and open, is shown at 56 px
- **THEN** its eyes close and open again every few seconds, and the avatar rises and falls
  gently

#### Scenario: A face with closed eyes
- **WHEN** Explorer, whose "happy" eyes are drawn as arcs, is shown
- **THEN** its eyes never blink

#### Scenario: Several avatars
- **WHEN** the Mini-Me playground shows every Mini-Me
- **THEN** they blink at different moments

### Requirement: Avatars look toward the pointer
The Eyes, Mouth and Accessory layers of an avatar of 40 px or more SHALL lean a short way
toward the pointer while the pointer is in the app window, as if the Mini-Me turns its head to
look at it: the eyes farthest, the mouth less and the accessory least. They SHALL return to
the centre when the pointer leaves the window. The body SHALL stay in place.

#### Scenario: Pointer to the left
- **WHEN** the pointer is to the left of the 150 px avatar in the Mini-Me editor
- **THEN** the avatar's eyes lean left the most, its mouth less and its accessory least,
  while its body stays put

#### Scenario: Pointer leaves the window
- **WHEN** the pointer leaves the app window
- **THEN** every avatar's eyes, mouth and accessory return to the centre
