//! Feature flags: features a release carries switched off, each turned on by its own key.

use serde::Serialize;

pub struct Feature {
    /// Stable across versions: a new ID counts as a new flag, whose key testers enter again.
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    /// What a tester enters in Settings to turn the flag on.
    pub key: &'static str,
}

/// The feature flags this release carries; docs/feature-flags.md explains adding one.
pub const FEATURES: &[Feature] = &[];

/// A flag as the UI shows it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FeatureFlag {
    pub id: String,
    pub name: String,
    pub description: String,
}

impl From<&Feature> for FeatureFlag {
    fn from(feature: &Feature) -> Self {
        FeatureFlag {
            id: feature.id.to_string(),
            name: feature.name.to_string(),
            description: feature.description.to_string(),
        }
    }
}

/// The flag that `key` turns on, ignoring spaces around the key.
pub fn matching<'a>(features: &'a [Feature], key: &str) -> Option<&'a Feature> {
    let key = key.trim();
    features
        .iter()
        .find(|feature| !key.is_empty() && feature.key == key)
}

/// The flags that are on, in list order. In Mini-Me a flag is on once its key was entered
/// (`unlocked`); in Mini-Me Canary it is on until it is turned off (`locked`). IDs of flags not in
/// `features` are ignored.
pub fn active<'a>(
    features: &'a [Feature],
    unlocked: &[String],
    locked: &[String],
    is_canary: bool,
) -> Vec<&'a Feature> {
    let is_listed = |ids: &[String], id: &str| ids.iter().any(|listed| listed == id);
    features
        .iter()
        .filter(|feature| {
            if is_canary {
                !is_listed(locked, feature.id)
            } else {
                is_listed(unlocked, feature.id)
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_FEATURES: &[Feature] = &[
        Feature {
            id: "test-flag",
            name: "Test flag",
            description: "Only in tests.",
            key: "test-key",
        },
        Feature {
            id: "other-flag",
            name: "Other flag",
            description: "Only in tests.",
            key: "other-key",
        },
    ];

    fn ids(features: Vec<&Feature>) -> Vec<&str> {
        features.into_iter().map(|feature| feature.id).collect()
    }

    #[test]
    fn a_key_turns_on_only_its_own_flag() {
        assert_eq!(
            matching(TEST_FEATURES, "test-key").map(|f| f.id),
            Some("test-flag")
        );
        assert_eq!(
            matching(TEST_FEATURES, "  test-key\n").map(|f| f.id),
            Some("test-flag")
        );
        assert!(matching(TEST_FEATURES, "wrong-key").is_none());
        assert!(matching(TEST_FEATURES, "").is_none());
    }

    #[test]
    fn flags_are_off_in_mini_me_and_on_in_mini_me_dev_by_default() {
        assert!(active(TEST_FEATURES, &[], &[], false).is_empty());
        assert_eq!(
            ids(active(TEST_FEATURES, &[], &[], true)),
            ["test-flag", "other-flag"]
        );
    }

    #[test]
    fn the_stored_lists_turn_flags_on_and_off_and_unknown_ids_are_ignored() {
        let unlocked = ["test-flag".to_string(), "gone-flag".to_string()];
        let locked = ["other-flag".to_string(), "gone-flag".to_string()];
        assert_eq!(
            ids(active(TEST_FEATURES, &unlocked, &locked, false)),
            ["test-flag"]
        );
        assert_eq!(
            ids(active(TEST_FEATURES, &unlocked, &locked, true)),
            ["test-flag"]
        );
    }
}
