//! App settings stored in the OS app-config directory, outside Mini-Me Data, so Project
//! folders stay self-contained.

use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::features::{self, FEATURES, Feature};
use crate::link::{ApiFormat, CallModel, DebugParts};
use crate::paths::write_atomic;
use crate::protocol::{Origin, new_id};
use crate::secrets::is_provider;

const FILE_NAME: &str = "settings.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Settings {
    pub installation_id: Uuid,
    pub user_id: Uuid,
    /// Project ID → last time it was opened (Unix ms).
    #[serde(default)]
    pub recent_projects: HashMap<Uuid, i64>,
    #[serde(default)]
    pub ai: AiSettings,
    #[serde(default)]
    pub routing: RoutingSettings,
    #[serde(default)]
    pub debug: DebugSettings,
    #[serde(default)]
    pub home: HomeSettings,
    /// Shows developer options; while unset it follows the app (on in Mini-Me Canary, off in
    /// Mini-Me).
    #[serde(default)]
    pub developer_mode: Option<bool>,
    /// The Quarto program the user chose in Settings; when unset, the app looks for one.
    #[serde(default)]
    pub quarto_path: Option<String>,
    /// The version whose What's new was last shown, or that ran when settings were created; none
    /// shows What's new on the next launch.
    #[serde(default)]
    pub last_seen_version: Option<String>,
    /// The feature flags whose key was entered, which are on in Mini-Me.
    #[serde(default)]
    pub unlocked_features: Vec<String>,
    /// The feature flags turned off, which stay off in Mini-Me Canary until their key is entered.
    #[serde(default)]
    pub locked_features: Vec<String>,
}

/// How Home looks.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct HomeSettings {
    /// Whether the Mini-Mes appear on Home on their own; a key sequence brings them anyway.
    #[serde(default)]
    pub show_mini_mes: bool,
}

/// Developer aids that store parts of each reply's debug records, only while Developer mode is
/// on as well.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct DebugSettings {
    #[serde(default)]
    pub reply_input: bool,
    #[serde(default)]
    pub reply_details: bool,
    #[serde(default)]
    pub reply_tools: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RoutingSettings {
    /// Below this confidence in its choice, Jev's Mini-Me is replaced by the fallback Mini-Me
    /// and its reaction is left out; from 0 to 1.
    pub threshold: f64,
    /// A developer aid: store and show Jev's answers under each message.
    #[serde(default)]
    pub show_answers: bool,
    /// A developer aid: store and show what was sent to Jev under each message.
    #[serde(default)]
    pub show_asked: bool,
}

impl Default for RoutingSettings {
    fn default() -> Self {
        Self {
            threshold: 0.5,
            show_answers: false,
            show_asked: false,
        }
    }
}

impl RoutingSettings {
    /// Clamped to 0..=1; a value that is not finite is refused.
    pub fn set_threshold(&mut self, threshold: f64) -> AppResult<()> {
        if !threshold.is_finite() {
            return Err(AppError::invalid_input("The threshold must be a number from 0 to 1."));
        }
        self.threshold = threshold.clamp(0.0, 1.0);
        Ok(())
    }
}

/// The provider and model every AI Trait call uses. API keys are not here: they live in the
/// OS keychain.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiSettings {
    pub provider: String,
    /// Empty until the user types a model ID.
    pub model: String,
    /// Kept while another provider is chosen.
    #[serde(default)]
    pub custom: CustomEndpoint,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            model: String::new(),
            custom: CustomEndpoint::default(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct CustomEndpoint {
    pub endpoint: String,
    pub api_format: ApiFormat,
}

impl AiSettings {
    /// Refuses `custom` without an http(s) endpoint; for other providers `custom` is kept unchecked.
    pub fn new(provider: &str, model: &str, custom: CustomEndpoint) -> AppResult<Self> {
        if !is_provider(provider) {
            return Err(AppError::invalid_input(format!("Unknown provider {provider:?}.")));
        }
        let custom = CustomEndpoint {
            endpoint: custom.endpoint.trim().to_string(),
            ..custom
        };
        if provider == "custom" {
            check_endpoint(&custom.endpoint)?;
        }
        Ok(Self {
            provider: provider.to_string(),
            model: model.trim().to_string(),
            custom,
        })
    }

    /// The model for AI Trait calls, or `None` while no model is set.
    pub fn model(&self) -> Option<CallModel> {
        let custom = (self.provider == "custom").then_some(&self.custom);
        (!self.model.is_empty()).then(|| CallModel {
            provider: self.provider.clone(),
            model: self.model.clone(),
            endpoint: custom.map(|c| c.endpoint.clone()),
            api_format: custom.map(|c| c.api_format),
        })
    }
}

fn check_endpoint(endpoint: &str) -> AppResult<()> {
    if endpoint.is_empty() {
        return Err(AppError::invalid_input("Type the URL of the custom endpoint."));
    }
    let is_web_address = reqwest::Url::parse(endpoint).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https") && url.host_str().is_some_and(|h| !h.is_empty())
    });
    if !is_web_address {
        return Err(AppError::invalid_input(
            "The endpoint must start with http:// or https://, such as http://localhost:1234/v1.",
        ));
    }
    Ok(())
}

impl Settings {
    /// Creates settings with fresh IDs on first launch, recording `version` as shown: a new install
    /// has nothing to announce.
    pub fn load_or_create(config_dir: &Path, version: &str) -> AppResult<Self> {
        let path = config_dir.join(FILE_NAME);
        if path.exists() {
            let raw = std::fs::read_to_string(&path)?;
            return Ok(serde_json::from_str(&raw)?);
        }
        let settings = Settings {
            installation_id: new_id(),
            user_id: new_id(),
            recent_projects: HashMap::new(),
            ai: AiSettings::default(),
            routing: RoutingSettings::default(),
            debug: DebugSettings::default(),
            home: HomeSettings::default(),
            developer_mode: None,
            quarto_path: None,
            last_seen_version: Some(version.to_string()),
            unlocked_features: Vec::new(),
            locked_features: Vec::new(),
        };
        settings.save(config_dir)?;
        Ok(settings)
    }

    /// Writes to a temporary file and renames it, so a crash never leaves a half-written file.
    pub fn save(&self, config_dir: &Path) -> AppResult<()> {
        std::fs::create_dir_all(config_dir)?;
        write_atomic(&config_dir.join(FILE_NAME), serde_json::to_string_pretty(self)?.as_bytes())?;
        Ok(())
    }

    /// Whether to open What's new for the running `version`: it is not the version last shown,
    /// and this is not Mini-Me Canary. Records `version` as shown, so the caller saves.
    pub fn take_whats_new(&mut self, version: &str, is_canary: bool) -> bool {
        if is_canary || self.last_seen_version.as_deref() == Some(version) {
            return false;
        }
        self.last_seen_version = Some(version.to_string());
        true
    }

    pub fn developer_mode(&self, is_canary: bool) -> bool {
        self.developer_mode.unwrap_or(is_canary)
    }

    pub fn reply_debug(&self, is_canary: bool) -> DebugParts {
        let on = self.developer_mode(is_canary);
        DebugParts {
            input: on && self.debug.reply_input,
            details: on && self.debug.reply_details,
            tools: on && self.debug.reply_tools,
        }
    }

    pub fn active_features(&self, is_canary: bool) -> Vec<&'static Feature> {
        features::active(FEATURES, &self.unlocked_features, &self.locked_features, is_canary)
    }

    /// Records the flag `id` as on, as entering its key does.
    pub fn unlock_feature(&mut self, id: &str) {
        self.locked_features.retain(|locked| locked != id);
        if !self.unlocked_features.iter().any(|unlocked| unlocked == id) {
            self.unlocked_features.push(id.to_string());
        }
    }

    /// Records the flag `id` as off, so only its key turns it on again.
    pub fn lock_feature(&mut self, id: &str) {
        self.unlocked_features.retain(|unlocked| unlocked != id);
        if !self.locked_features.iter().any(|locked| locked == id) {
            self.locked_features.push(id.to_string());
        }
    }

    pub fn origin(&self) -> Origin {
        Origin {
            installation_id: self.installation_id,
            user_id: self.user_id,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_and_recent_projects_are_kept_across_loads() {
        let dir = tempfile::tempdir().unwrap();
        let mut first = Settings::load_or_create(dir.path(), "0.5.2").unwrap();
        let project = new_id();
        first.recent_projects.insert(project, 42);
        first.save(dir.path()).unwrap();
        let second = Settings::load_or_create(dir.path(), "0.5.2").unwrap();
        assert_eq!(first.installation_id, second.installation_id);
        assert_eq!(first.user_id, second.user_id);
        assert_eq!(second.recent_projects.get(&project), Some(&42));
    }

    #[test]
    fn whats_new_opens_once_after_an_update_and_never_on_a_new_install_or_in_dev() {
        // A new install records the running version, so there is nothing to announce.
        let dir = tempfile::tempdir().unwrap();
        let mut fresh = Settings::load_or_create(dir.path(), "0.5.2").unwrap();
        assert!(!fresh.take_whats_new("0.5.2", false));

        // Settings from before the version was remembered count as updated, once.
        let old = r#"{ "installation_id": "0199d0a0-0000-7000-8000-0000000000e1",
                      "user_id": "0199d0a0-0000-7000-8000-0000000000e2" }"#;
        let other = tempfile::tempdir().unwrap();
        std::fs::write(other.path().join(FILE_NAME), old).unwrap();
        let mut settings = Settings::load_or_create(other.path(), "0.5.2").unwrap();
        assert!(settings.take_whats_new("0.5.2", false));
        assert!(!settings.take_whats_new("0.5.2", false));

        // A different version shows once, and Mini-Me Canary never shows or records.
        assert!(!settings.take_whats_new("0.6.0", true));
        assert_eq!(settings.last_seen_version.as_deref(), Some("0.5.2"));
        assert!(settings.take_whats_new("0.6.0", false));
        assert!(!settings.take_whats_new("0.6.0", false));
    }

    #[test]
    fn settings_without_ai_load_with_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let old = r#"{ "installation_id": "0199d0a0-0000-7000-8000-0000000000e1",
                      "user_id": "0199d0a0-0000-7000-8000-0000000000e2" }"#;
        std::fs::write(dir.path().join(FILE_NAME), old).unwrap();
        let settings = Settings::load_or_create(dir.path(), "0.5.2").unwrap();
        assert_eq!(settings.ai, AiSettings::default());
        assert_eq!(settings.routing, RoutingSettings::default());
        assert!(!settings.home.show_mini_mes);
        assert!(!settings.developer_mode(false));
        assert!(settings.developer_mode(true));
        assert_eq!(settings.ai.model(), None);
        assert!(settings.unlocked_features.is_empty() && settings.locked_features.is_empty());

        let without_custom = r#"{ "installation_id": "0199d0a0-0000-7000-8000-0000000000e1",
                                  "user_id": "0199d0a0-0000-7000-8000-0000000000e2",
                                  "ai": { "provider": "google", "model": "g" } }"#;
        std::fs::write(dir.path().join(FILE_NAME), without_custom).unwrap();
        let settings = Settings::load_or_create(dir.path(), "0.5.2").unwrap();
        assert_eq!(settings.ai.custom, CustomEndpoint::default());
    }

    #[test]
    fn turning_a_flag_on_and_off_moves_it_between_the_lists() {
        let dir = tempfile::tempdir().unwrap();
        let mut settings = Settings::load_or_create(dir.path(), "0.5.2").unwrap();
        settings.unlock_feature("test-flag");
        settings.unlock_feature("test-flag");
        assert_eq!(settings.unlocked_features, ["test-flag"]);
        assert!(settings.locked_features.is_empty());
        settings.lock_feature("test-flag");
        assert!(settings.unlocked_features.is_empty());
        assert_eq!(settings.locked_features, ["test-flag"]);
    }

    #[test]
    fn the_model_is_saved_without_any_key() {
        let dir = tempfile::tempdir().unwrap();
        let mut settings = Settings::load_or_create(dir.path(), "0.5.2").unwrap();
        settings.ai =
            AiSettings::new("anthropic", "  example-model ", CustomEndpoint::default()).unwrap();
        settings.save(dir.path()).unwrap();
        let saved = std::fs::read_to_string(dir.path().join(FILE_NAME)).unwrap();
        assert!(!saved.to_lowercase().contains("key"));
        let loaded = Settings::load_or_create(dir.path(), "0.5.2").unwrap();
        assert_eq!(
            loaded.ai.model(),
            Some(CallModel {
                provider: "anthropic".into(),
                model: "example-model".into(),
                ..Default::default()
            })
        );
        assert!(AiSettings::new("dummy", "m", CustomEndpoint::default()).is_err());
    }

    #[test]
    fn custom_needs_a_web_address_as_its_endpoint() {
        let custom = |endpoint: &str| CustomEndpoint {
            endpoint: endpoint.into(),
            api_format: ApiFormat::Anthropic,
        };
        for refused in ["", "  ", "localhost:1234", "ftp://models.example.org", "http://"] {
            let error = AiSettings::new("custom", "m", custom(refused)).unwrap_err();
            assert_eq!(error.code, "invalid_input", "{refused:?}");
        }
        let ai = AiSettings::new("custom", "m", custom(" http://localhost:1234/v1 ")).unwrap();
        assert_eq!(ai.custom, custom("http://localhost:1234/v1"));
        let model = ai.model().unwrap();
        assert_eq!(model.endpoint.as_deref(), Some("http://localhost:1234/v1"));
        assert_eq!(model.api_format, Some(ApiFormat::Anthropic));
        // Another provider keeps whatever Custom endpoint is there, unchecked and not sent.
        let openai = AiSettings::new("openai", "m", custom("")).unwrap().model().unwrap();
        assert_eq!((openai.endpoint, openai.api_format), (None, None));
        let frame = serde_json::to_value(ai.model()).unwrap();
        assert_eq!(frame["api_format"], "anthropic");
    }

    #[test]
    fn the_threshold_is_clamped_to_zero_to_one() {
        let mut routing = RoutingSettings::default();
        routing.set_threshold(1.7).unwrap();
        assert_eq!(routing.threshold, 1.0);
        routing.set_threshold(-0.2).unwrap();
        assert_eq!(routing.threshold, 0.0);
        routing.set_threshold(0.65).unwrap();
        assert_eq!(routing.threshold, 0.65);
        assert!(routing.set_threshold(f64::NAN).is_err());
    }
}
