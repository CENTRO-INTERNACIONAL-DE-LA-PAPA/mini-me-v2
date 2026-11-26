# Spec Delta

## ADDED Requirements

### Requirement: The data Mini-Mes show their analyses in the reply
In the Exploratory Data Analysis Mini-Me's Workflow, the *Profile Data*, *Describe Variables*,
*Find Correlations*, *Detect Outliers*, *Find Clusters* and *Plot* Steps, and in the
Diagnostic Analytics Mini-Me's Workflow, the *Compare Groups*, *Find Drivers*, *Check
Confounders*, *Analyze Trends* and *Plot* Steps, SHALL have `show_results` set.

#### Scenario: An exploration's charts under the summary
- **WHEN** an Exploratory Data Analysis run ends
- **THEN** the reply shows the summary, then the tables and charts of the Steps that ran
