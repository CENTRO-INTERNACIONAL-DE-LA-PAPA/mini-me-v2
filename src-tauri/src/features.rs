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
