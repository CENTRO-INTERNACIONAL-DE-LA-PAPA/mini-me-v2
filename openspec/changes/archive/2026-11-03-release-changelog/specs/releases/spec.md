# Spec Delta

## ADDED Requirements

### Requirement: Release notes come from the changelog
The repository SHALL have a `CHANGELOG.md` holding only the notes of the release it is committed
for, under a first heading `# Mini-Me <version>`, followed by sections named "New", "Improved" and
"Fixed", each left out when empty, written in plain language for users. The draft GitHub Release
SHALL carry that text as its notes. The release build SHALL fail, creating no draft release, when
the heading's version differs from the tag's version.

#### Scenario: Notes on the draft
- **WHEN** the tag `v0.6.0` is pushed and `CHANGELOG.md` starts with `# Mini-Me 0.6.0`
- **THEN** the draft release "Mini-Me 0.6.0" shows the changelog's text as its notes

#### Scenario: Changelog for another version
- **WHEN** the tag `v0.6.0` is pushed while `CHANGELOG.md` starts with `# Mini-Me 0.5.2`
- **THEN** the build fails naming both versions, and no draft release is created
