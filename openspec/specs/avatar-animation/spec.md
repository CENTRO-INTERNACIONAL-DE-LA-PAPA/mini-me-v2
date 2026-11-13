# avatar-animation Specification

## Purpose

Defines how a Mini-Me's avatar moves wherever it is drawn: idle life, reactions to the pointer,
the working animation while its reply streams, and when avatars stay still.

## Requirements

### Requirement: Avatars blink and breathe while idle
An avatar whose face has open eyes SHALL blink now and then; a face whose eyes are closed or
drawn as lines or arcs SHALL NOT blink. An avatar of 40 px or more SHALL also rise and fall
gently as it breathes. Avatars shown together SHALL blink and breathe out of step, not all at
once.

#### Scenario: A face with open eyes
- **WHEN** Scribe, whose "quiet" face has round open eyes, is shown at 56 px
- **THEN** its eyes close and open again every few seconds, and the avatar rises and falls
  gently

#### Scenario: A face with closed eyes
- **WHEN** Explorer, whose "joyful" face has eyes drawn as arcs, is shown
- **THEN** its eyes never blink

#### Scenario: Several avatars
- **WHEN** the Mini-Me playground shows every Mini-Me
- **THEN** they blink at different moments

### Requirement: Avatars react to a click
An avatar of 40 px or more SHALL squash and hop once when it is clicked, and SHALL NOT move
when the pointer only passes over it. The hop SHALL NOT change what the click does where the
avatar sits, such as picking a part or showing a Mini-Me's name in the playground.

#### Scenario: Click in the editor
- **WHEN** the user clicks the 150 px avatar in the Mini-Me editor
- **THEN** it squashes and hops once

#### Scenario: Click in the playground
- **WHEN** the user clicks a Mini-Me in the playground
- **THEN** it squashes and hops, and its name is shown as before

### Requirement: Avatars look toward the pointer
The eyes, mouth and accessory of an avatar of 40 px or more SHALL lean a short way toward the
pointer while the pointer is in the app window, as if the Mini-Me turns its head to look at
it: the eyes farthest, the mouth less and the accessory least. They SHALL return to the
centre when the pointer leaves the window. The body SHALL stay in place.

#### Scenario: Pointer to the left
- **WHEN** the pointer is to the left of the 150 px avatar in the Mini-Me editor
- **THEN** the avatar's eyes lean left the most, its mouth less and its accessory least,
  while its body stays put

#### Scenario: Pointer leaves the window
- **WHEN** the pointer leaves the app window
- **THEN** every avatar's eyes, mouth and accessory return to the centre

### Requirement: A Mini-Me shows that it is working
While a Mini-Me's reply streams, its avatar SHALL play a working animation, at any size,
wherever the avatar stands for that reply: the reply's header, and the "Running" status
under its Conversation in the sidebar. The animation SHALL stop when the reply ends,
pauses for approval or fails.

#### Scenario: Streaming reply
- **WHEN** Scribe's reply is streaming
- **THEN** Scribe's avatar in the reply's header and next to "Running" plays the working
  animation

#### Scenario: Waiting for approval
- **WHEN** Investigator's reply pauses for the user's approval
- **THEN** Investigator's avatar next to "Needs your approval" is not playing the working
  animation

#### Scenario: The same Mini-Me elsewhere
- **WHEN** Scribe's reply is streaming and Scribe's pill is shown in an earlier message
- **THEN** the pill's avatar is not playing the working animation

### Requirement: Small avatars only blink
An avatar under 40 px SHALL only blink and, while its Mini-Me is working, play the working
animation. It SHALL NOT breathe, hop or look toward the pointer.

#### Scenario: A pill
- **WHEN** the pointer moves over and around a 16 px Mini-Me pill
- **THEN** the pill's avatar does not lean, and only blinks

### Requirement: Avatars stay still under reduced motion
While the system's reduced-motion setting is on, avatars SHALL NOT blink, breathe, hop,
look toward the pointer or play the working animation. They SHALL start or stop moving when
the setting changes, without restarting the app.

#### Scenario: Reduced motion on
- **WHEN** the system's reduced-motion setting is on and Scribe's reply is streaming
- **THEN** Scribe's avatar is drawn still, and the reply's "Replying…" status still shows that
  it is working
