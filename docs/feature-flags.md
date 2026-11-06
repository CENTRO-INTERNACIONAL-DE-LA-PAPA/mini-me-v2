# Feature flags

A feature flag ships an experimental feature in the normal release, switched off. A tester turns
it on by entering the feature's key in Settings → Developer → Feature flags, so they can
try it without a separate build. In Mini-Me Dev every flag starts on.

Keys are plain text in the code, which is open source. A flag hides unfinished work; it is not
access control.

## Adding a flag

1. Add the flag to `FEATURES` in `src-tauri/src/features.rs`, with any key you like:

   ```rust
   pub const FEATURES: &[Feature] = &[Feature {
       id: "dark-theme",
       name: "Dark theme",
       description: "A dark version of every screen.",
       key: "night-owl",
   }];
   ```

2. Tell the testers the key.

Keep a flag's ID the same across versions: a new ID counts as a new flag, and testers have to
enter its key again. Once the feature is finished, remove the flag and its checks.

## Checking a flag

In the UI:

```tsx
import { useFeatureFlag } from "../../hooks/useFeatureFlags";

const darkTheme = useFeatureFlag("dark-theme");
```

In a Trait's adapter, during a call:

```python
if await context.feature_on("dark-theme"):
    ...
```
