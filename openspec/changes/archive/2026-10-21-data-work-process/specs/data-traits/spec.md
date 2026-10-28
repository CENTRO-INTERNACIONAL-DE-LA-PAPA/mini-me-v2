# Spec Delta

## ADDED Requirements

### Requirement: Stopping a data reply ends its work
A data Trait's computations, including reading its tables, SHALL run outside the sidecar's
main process, in a worker the sidecar can end. When the run is cancelled, the sidecar SHALL
end the worker of each of the run's calls within one second and end the run with
`run.cancelled`. Workers SHALL read and write no file and SHALL end when the sidecar ends.

#### Scenario: Stopping a long validation
- **WHEN** the user stops a *Validate Data* reply on a 100 MiB table while its checks run
- **THEN** the reply ends as cancelled and the computation stops within one second

#### Scenario: The next data reply after a stop
- **WHEN** the user sends a *Profile Data* request right after stopping a data reply
- **THEN** it runs and completes as usual

### Requirement: Data work does not hold up other replies
Reading and computing over a table SHALL NOT block the sidecar from handling other runs, so
replies of other Conversations keep streaming while a data Trait works.

#### Scenario: Profiling while another reply streams
- **WHEN** *Profile Data* reads a 100 MiB table while a Mini-Me's reply streams in another
  Conversation
- **THEN** the other reply keeps streaming without pausing
