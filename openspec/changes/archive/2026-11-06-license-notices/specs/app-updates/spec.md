# Spec Delta

## ADDED Requirements

### Requirement: Third-party Software page
Settings → About SHALL have a "Third-party Software" row that opens a page inside Mini-Me. The
page SHALL show Mini-Me's notice and license, then a table of contents of the third-party
components grouped by part of the app (core, interface, AI runtime), then a section for each
component with its name, version, a link to its repository when it has one, and its license
text. Clicking an entry of the table of contents SHALL go to its section. In a build without
the file, such as a development build, the page SHALL say the list comes with released builds.

#### Scenario: Finding a license
- **WHEN** the user opens "Third-party Software" in a released build and clicks `pandas` in the
  table of contents
- **THEN** the page goes to the `pandas` section, with its version, repository link and license
  text

#### Scenario: A development build
- **WHEN** the user opens "Third-party Software" in a build without the file
- **THEN** the page says the list comes with released builds
