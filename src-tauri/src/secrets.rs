//! Provider secrets handed to Traits during a call. A secret lives only in memory and prints
//! as `[redacted]`, so it cannot leak through `Debug` output, logs or error messages.

use crate::link::REDACTED;

pub struct Secret(String);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// The secret itself. Use it only to build the `secret.get` response.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(REDACTED)
    }
}

impl std::fmt::Display for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(REDACTED)
    }
}

/// Where the core looks up a provider's secret.
pub trait SecretSource: Send + Sync {
    fn get(&self, provider: &str) -> Option<Secret>;
}

/// The app has no secret store yet, so every lookup finds nothing.
pub struct NoSecrets;

impl SecretSource for NoSecrets {
    fn get(&self, _provider: &str) -> Option<Secret> {
        None
    }
}

#[cfg(test)]
pub mod test_support {
    use std::collections::HashMap;

    use super::*;

    pub struct MemorySecrets(pub HashMap<String, String>);

    impl MemorySecrets {
        pub fn dummy() -> Self {
            Self(HashMap::from([("dummy".to_string(), "sk-dummy-0123456789".to_string())]))
        }
    }

    impl SecretSource for MemorySecrets {
        fn get(&self, provider: &str) -> Option<Secret> {
            self.0.get(provider).map(Secret::new)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secrets_print_redacted() {
        let secret = Secret::new("sk-dummy-0123456789");
        assert_eq!(format!("{secret:?}"), REDACTED);
        assert_eq!(format!("{secret}"), REDACTED);
        assert_eq!(secret.expose(), "sk-dummy-0123456789");
    }
}
