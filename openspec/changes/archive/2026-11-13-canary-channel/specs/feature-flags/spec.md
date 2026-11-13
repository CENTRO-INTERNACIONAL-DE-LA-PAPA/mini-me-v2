# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Defaults in Mini-Me and Mini-Me Dev`
- TO: `### Requirement: Defaults in Mini-Me and Mini-Me Canary`

## MODIFIED Requirements

### Requirement: Defaults in Mini-Me and Mini-Me Canary
In Mini-Me every flag SHALL be off until its key is entered. In Mini-Me Canary every flag SHALL be
on until it is turned off, and a flag turned off there SHALL need its key to turn on again. A flag
added in a later version SHALL start on in Mini-Me Canary.

#### Scenario: First launch
- **WHEN** Mini-Me and Mini-Me Canary are opened for the first time
- **THEN** no flag is on in Mini-Me and every flag is on in Mini-Me Canary
