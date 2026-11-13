# Spec Delta

## REMOVED Requirements

### Requirement: Mini-Me Dev is a separate app
**Reason**: Mini-Me Dev is renamed Mini-Me Canary.
**Migration**: See "Mini-Me Canary is a separate app" in `canary-channel`.

### Requirement: Mini-Me Dev keeps its own data
**Reason**: Mini-Me Dev is renamed Mini-Me Canary, with the folder `Mini-Me Data (Canary)`.
**Migration**: See "Mini-Me Canary keeps its own data" in `canary-channel`. Nothing is moved from
`Mini-Me Data (Dev)`; rename the folder by hand to keep its Projects.

### Requirement: Local runs are Mini-Me Dev
**Reason**: Local runs are Mini-Me Canary.
**Migration**: See "Local runs are Mini-Me Canary" in `canary-channel`.

### Requirement: Mini-Me Dev does not update itself
**Reason**: Canary builds are published, and an installed Mini-Me Canary updates itself from them.
**Migration**: See "Mini-Me Canary updates itself from Canary builds" in `canary-channel`.

### Requirement: Developer mode
**Reason**: Developer mode has its own spec.
**Migration**: See "Developer mode" in `developer-mode`, which names Mini-Me Canary.

### Requirement: Jev's answers need Developer mode
**Reason**: Developer mode has its own spec.
**Migration**: Moved unchanged to `developer-mode`.

### Requirement: Avatars page in Settings
**Reason**: Developer mode has its own spec.
**Migration**: Moved unchanged to `developer-mode`.

### Requirement: Developer tools need Developer mode
**Reason**: Developer mode has its own spec.
**Migration**: Moved unchanged to `developer-mode`.

### Requirement: Sidecar log on the Developer page
**Reason**: Developer mode has its own spec.
**Migration**: Moved unchanged to `developer-mode`.

### Requirement: Reply debug details need Developer mode
**Reason**: Developer mode has its own spec.
**Migration**: Moved unchanged to `developer-mode`.
