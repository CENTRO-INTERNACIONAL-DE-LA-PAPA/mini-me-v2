//! The shared Trait library and the Mini-Mes built from it. Definitions are data: the
//! built-in ones are embedded from `library/builtin.json`.

use serde::{Deserialize, Serialize};
use uuid::{Uuid, uuid};

/// The Mini-Me the routing stand-in picks when a message mentions none.
pub const ECHO_MINI_ME: Uuid = uuid!("5f0c8a2e-6d1b-4b7e-9a43-2c8e1f0d7b02");

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TraitDef {
    pub id: Uuid,
    /// An imperative verb in Title Case.
    pub name: String,
    pub description: String,
    pub color: String,
    /// The sidecar adapter that runs this Trait.
    pub adapter: String,
    pub instructions: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MiniMeColors {
    pub tint: String,
    pub solid: String,
    pub ink: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Step {
    /// The ID of the Trait this Step runs.
    #[serde(rename = "trait")]
    pub trait_id: Uuid,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Workflow {
    pub steps: Vec<Step>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MiniMe {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub colors: MiniMeColors,
    pub workflow: Workflow,
}

/// What the UI needs to list and show a Mini-Me.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MiniMeSummary {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub colors: MiniMeColors,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Library {
    traits: Vec<TraitDef>,
    mini_mes: Vec<MiniMe>,
}

impl Library {
    /// The built-in library. Its content is checked by this module's tests, so parsing it
    /// cannot fail at run time.
    pub fn builtin() -> Self {
        let library: Self = serde_json::from_str(include_str!("../library/builtin.json"))
            .expect("library/builtin.json is valid");
        debug_assert_eq!(library.problems(), Vec::<String>::new());
        library
    }

    pub fn mini_me(&self, id: Uuid) -> Option<&MiniMe> {
        self.mini_mes.iter().find(|m| m.id == id)
    }

    pub fn trait_def(&self, id: Uuid) -> Option<&TraitDef> {
        self.traits.iter().find(|t| t.id == id)
    }

    /// The Trait a one-Step Mini-Me runs.
    pub fn step_trait(&self, mini_me: &MiniMe) -> Option<&TraitDef> {
        mini_me
            .workflow
            .steps
            .first()
            .and_then(|step| self.trait_def(step.trait_id))
    }

    pub fn summaries(&self) -> Vec<MiniMeSummary> {
        self.mini_mes
            .iter()
            .map(|m| MiniMeSummary {
                id: m.id,
                name: m.name.clone(),
                description: m.description.clone(),
                colors: m.colors.clone(),
            })
            .collect()
    }

    /// Every problem with the definitions, empty when they are consistent.
    fn problems(&self) -> Vec<String> {
        let mut problems = Vec::new();
        let mut ids: Vec<Uuid> = self.traits.iter().map(|t| t.id).collect();
        ids.extend(self.mini_mes.iter().map(|m| m.id));
        let count = ids.len();
        ids.sort();
        ids.dedup();
        if ids.len() != count {
            problems.push("two definitions share an ID".to_string());
        }
        for t in &self.traits {
            let title_case = t
                .name
                .split(' ')
                .all(|word| word.chars().next().is_some_and(char::is_uppercase));
            if !title_case {
                problems.push(format!("Trait name {:?} is not in Title Case", t.name));
            }
        }
        for m in &self.mini_mes {
            if m.workflow.steps.len() != 1 {
                problems.push(format!("{} does not have exactly one Step", m.name));
            }
            for step in &m.workflow.steps {
                if self.trait_def(step.trait_id).is_none() {
                    problems.push(format!("{} runs an unknown Trait {}", m.name, step.trait_id));
                }
            }
        }
        problems
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_library_is_consistent() {
        let library = Library::builtin();
        assert_eq!(library.problems(), Vec::<String>::new());
        let names: Vec<&str> = library.traits.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(names, ["Summarize", "Echo"]);
    }

    #[test]
    fn mini_mes_run_their_step_trait() {
        let library = Library::builtin();
        let echo = library.mini_me(ECHO_MINI_ME).unwrap();
        assert_eq!(library.step_trait(echo).unwrap().adapter, "echo");
        let scribe = library.summaries().into_iter().find(|m| m.name == "Scribe").unwrap();
        let scribe = library.mini_me(scribe.id).unwrap();
        assert_eq!(library.step_trait(scribe).unwrap().name, "Summarize");
    }

    #[test]
    fn inconsistent_definitions_are_reported() {
        let mut library = Library::builtin();
        library.traits[1].id = library.traits[0].id;
        library.traits[0].name = "summarize".into();
        library.mini_mes[0].workflow.steps.clear();
        let problems = library.problems();
        assert!(problems.iter().any(|p| p.contains("share an ID")));
        assert!(problems.iter().any(|p| p.contains("Title Case")));
        assert!(problems.iter().any(|p| p.contains("exactly one Step")));
    }
}
