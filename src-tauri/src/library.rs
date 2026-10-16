//! The shared Trait library and the Mini-Mes built from it. Definitions are data: the
//! built-in ones are embedded from `library/builtin.json`.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

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
    /// The Interactive Component kinds this Trait's answers may include. Only built-in
    /// Traits list any.
    #[serde(default)]
    pub components: Vec<String>,
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
                match self.trait_def(step.trait_id) {
                    None => {
                        problems.push(format!("{} runs an unknown Trait {}", m.name, step.trait_id))
                    }
                    // Placeholder Traits run on `echo` until they are built, so no Mini-Me
                    // may offer them.
                    Some(t) if t.adapter == "echo" => {
                        problems.push(format!("{} runs the placeholder Trait {}", m.name, t.name))
                    }
                    Some(_) => {}
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
        assert_eq!(
            names,
            [
                "Summarize",
                "Assist",
                "Find Papers",
                "Theorize",
                "Scout",
                "Refute",
                "Plan",
                "Wonder",
                "Experiment",
                "Document",
                "Explore Dataverse",
                "Code",
                "Collect Data",
                "Model",
                "Predict",
                "Index Sources",
            ]
        );
    }

    #[test]
    fn only_the_asta_traits_list_components() {
        let library = Library::builtin();
        let lists: Vec<(&str, Vec<&str>)> = library
            .traits
            .iter()
            .filter(|t| !t.components.is_empty())
            .map(|t| (t.name.as_str(), t.components.iter().map(String::as_str).collect()))
            .collect();
        assert_eq!(
            lists,
            [("Find Papers", vec!["paper-sources"]), ("Theorize", vec!["theories"])]
        );
    }

    #[test]
    fn mini_mes_run_their_step_trait() {
        let library = Library::builtin();
        let step = |name: &str| {
            let summary = library.summaries().into_iter().find(|m| m.name == name).unwrap();
            let mini_me = library.mini_me(summary.id).unwrap();
            library.step_trait(mini_me).unwrap().clone()
        };
        assert_eq!(step("Scribe").name, "Summarize");
        let assist = step("Assistant");
        assert_eq!((assist.name.as_str(), assist.adapter.as_str()), ("Assist", "prompt"));
        assert_eq!(step("Researcher").adapter, "asta-paper-finder");
        assert_eq!(step("Theorist").adapter, "asta-theorizer");
        for (mini_me, name) in [
            ("Explorer", "Scout"),
            ("Skeptic", "Refute"),
            ("Planner", "Plan"),
            ("Inquirer", "Wonder"),
            ("Experimenter", "Experiment"),
        ] {
            let t = step(mini_me);
            assert_eq!((t.name.as_str(), t.adapter.as_str()), (name, "prompt"));
            assert!(t.instructions.is_some());
        }
    }

    #[test]
    fn placeholder_traits_run_on_echo_without_instructions() {
        let library = Library::builtin();
        let placeholders: Vec<&str> = library
            .traits
            .iter()
            .filter(|t| t.adapter == "echo")
            .inspect(|t| assert_eq!(t.instructions, None))
            .map(|t| t.name.as_str())
            .collect();
        assert_eq!(
            placeholders,
            [
                "Document",
                "Explore Dataverse",
                "Code",
                "Collect Data",
                "Model",
                "Predict",
                "Index Sources",
            ]
        );
    }

    #[test]
    fn inconsistent_definitions_are_reported() {
        let mut library = Library::builtin();
        library.traits[1].id = library.traits[0].id;
        library.traits[0].name = "summarize".into();
        library.mini_mes[0].workflow.steps.clear();
        let document = library.traits.iter().find(|t| t.name == "Document").unwrap().id;
        library.mini_mes[1].workflow.steps[0].trait_id = document;
        let problems = library.problems();
        assert!(problems.iter().any(|p| p.contains("share an ID")));
        assert!(problems.iter().any(|p| p.contains("Title Case")));
        assert!(problems.iter().any(|p| p.contains("exactly one Step")));
        assert!(problems.iter().any(|p| p.contains("placeholder Trait Document")));
    }
}
