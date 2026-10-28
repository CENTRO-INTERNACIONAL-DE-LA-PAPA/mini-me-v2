# Spec Delta

## MODIFIED Requirements

### Requirement: Mini-Me Data folder
On first launch the app SHALL create a folder named `Mini-Me Data` in the user's Documents
folder, and SHALL use it as the root for all Projects. Mini-Me Dev SHALL use a folder named
`Mini-Me Data (Dev)` instead. If the folder already exists, its contents SHALL be kept.

#### Scenario: First launch
- **WHEN** the app starts and no `Mini-Me Data` folder exists in the Documents folder
- **THEN** the folder is created and the Project list is empty

#### Scenario: Existing data is preserved
- **WHEN** the app starts and the `Mini-Me Data` folder already contains Projects
- **THEN** those Projects are listed and none of their files are changed

#### Scenario: Mini-Me Dev's first launch
- **WHEN** Mini-Me Dev starts for the first time while `Mini-Me Data` holds Projects
- **THEN** `Mini-Me Data (Dev)` is created, Mini-Me Dev's Project list is empty, and
  `Mini-Me Data` is unchanged
