# routing Specification

## Purpose

Defines which Mini-Me answers a user message and whether it also reacts to it. Until
Typesafe's Jev is integrated, a fixed stand-in makes the decisions Jev will make.

## Requirements

### Requirement: A mentioned Mini-Me answers
When a user message contains one or more Mini-Me mentions, the first mentioned Mini-Me
SHALL answer it, and no routing decision SHALL be made.

#### Scenario: Mention
- **WHEN** the user sends "@Scribe summarize #notes.txt"
- **THEN** Scribe answers

#### Scenario: Two mentions
- **WHEN** the user sends "@Echo and @Scribe, hello"
- **THEN** Echo answers, and only Echo

### Requirement: Jev stand-in picks a Mini-Me
When a user message has no Mini-Me mention, the Rust core SHALL ask the routing stand-in,
which SHALL always pick the Echo Mini-Me. The stand-in SHALL be replaceable by Jev without
changing how the chosen Mini-Me's reply is produced.

#### Scenario: No mention
- **WHEN** the user sends "late blight spreads" without a mention
- **THEN** the Echo Mini-Me answers "late blight spreads"

### Requirement: Jev stand-in decides on a reaction
For every user message, the stand-in SHALL decide whether the answering Mini-Me also reacts
to it, using fixed rules matched case-insensitively, as whole words or phrases, against the
message content:
- `thank`, `thanks`, `great`, `awesome`, `perfect` → 👍;
- `congrats`, `congratulations`, `it worked`, `we did it` → 🎉;
- otherwise no reaction.

If both rules match, 🎉 wins.

#### Scenario: Both rules match
- **WHEN** the user sends "it worked, thanks!"
- **THEN** the stand-in picks 🎉

#### Scenario: No reaction
- **WHEN** the user sends "late blight spreads"
- **THEN** no reaction is added

### Requirement: Mini-Me reactions are persisted with the reply
A reaction chosen by the stand-in SHALL be persisted when the reply starts, as
`reaction.added` with payload `{ message_id, emoji, by: { kind: "mini_me", id: <Mini-Me ID> } }`
on the user's message, from the answering Mini-Me. A reaction SHALL NOT replace the reply.

#### Scenario: Thanks
- **WHEN** the user sends "@Scribe thanks, summarize #notes.txt"
- **THEN** Scribe adds 👍 to the user's message and also replies with the summary
