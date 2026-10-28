//! The shared Trait library and the Mini-Mes built from it. Definitions are data: the
//! built-in ones are embedded from `library/builtin.json`, and user-made ones are added by
//! `user_library`.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Assistant, who answers when routing has no mentioned or confident choice.
pub const FALLBACK_MINI_ME: Uuid = Uuid::from_u128(0x5f0c8a2e_6d1b_4b7e_9a43_2c8e1f0d7b03);

/// Every tool a Trait may list; the sidecar's `tools` package knows the same names.
pub const TOOLS: [&str; 9] = [
    "read_file",
    "read_table",
    "read_component",
    "save_file",
    "write_document",
    "show_table",
    "show_chart",
    "show_papers",
    "show_theories",
];

/// The tools a prompt-based Trait may list: those with a form for models. The read tools are
/// offered to every prompt-based Trait, so it does not list them.
pub const MODEL_TOOLS: [&str; 3] = ["save_file", "show_table", "write_document"];

/// The adapter that offers a Trait's tools to its AI model, and the only one user-made
/// Traits run on.
pub const PROMPT_ADAPTER: &str = "prompt";

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
    /// The tools this Trait may use: those its adapter's code uses, or, for a prompt-based
    /// Trait, those its model is offered besides the read tools.
    #[serde(default)]
    pub tools: Vec<String>,
}

/// Which heading the `@` list shows a Mini-Me under.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MiniMeGroup {
    Thinking,
    Literature,
    Data,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MiniMeColors {
    pub tint: String,
    pub solid: String,
    pub ink: String,
}

/// The parts a Mini-Me's avatar is drawn from, named by the UI's avatar part files. The body
/// takes the Mini-Me's `solid` colour and the freckles its `ink`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MiniMeAvatar {
    pub base: String,
    pub face: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accessory: Option<String>,
}

/// A node in a Workflow: a Trait Step or a control Step. In JSON a Step without `type` is a
/// Trait Step.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "serde_json::Map<String, serde_json::Value>")]
pub struct Step {
    /// Unique within its Workflow.
    pub id: String,
    /// The name a control Step is shown with; Trait Steps show their Trait's name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(flatten)]
    pub kind: StepKind,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StepKind {
    Trait {
        #[serde(rename = "trait")]
        trait_id: Uuid,
    },
    Approval {
        prompt: String,
    },
    Condition {
        question: String,
        branches: Vec<Branch>,
    },
    Loop {
        question: String,
        max_iterations: u32,
        steps: Vec<Step>,
    },
    Parallel {
        branches: Vec<Branch>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Branch {
    pub label: String,
    pub steps: Vec<Step>,
}

impl TryFrom<serde_json::Map<String, serde_json::Value>> for Step {
    type Error = serde_json::Error;

    fn try_from(mut map: serde_json::Map<String, serde_json::Value>) -> Result<Self, Self::Error> {
        #[derive(Deserialize)]
        struct Fields {
            id: String,
            #[serde(default)]
            label: Option<String>,
            #[serde(flatten)]
            kind: StepKind,
        }
        map.entry("type").or_insert_with(|| "trait".into());
        let Fields { id, label, kind } = serde_json::from_value(map.into())?;
        Ok(Step { id, label, kind })
    }
}

impl Step {
    /// The name of this Step's type, as in its JSON `type`.
    pub fn type_name(&self) -> &'static str {
        match self.kind {
            StepKind::Trait { .. } => "trait",
            StepKind::Approval { .. } => "approval",
            StepKind::Condition { .. } => "condition",
            StepKind::Loop { .. } => "loop",
            StepKind::Parallel { .. } => "parallel",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Workflow {
    pub steps: Vec<Step>,
}

impl Workflow {
    /// Every Step, nested ones included, depth first in Workflow order.
    pub fn all_steps(&self) -> Vec<&Step> {
        fn walk<'a>(steps: &'a [Step], out: &mut Vec<&'a Step>) {
            for step in steps {
                out.push(step);
                match &step.kind {
                    StepKind::Loop { steps, .. } => walk(steps, out),
                    StepKind::Condition { branches, .. } | StepKind::Parallel { branches } => {
                        for branch in branches {
                            walk(&branch.steps, out);
                        }
                    }
                    StepKind::Trait { .. } | StepKind::Approval { .. } => {}
                }
            }
        }
        let mut out = Vec::new();
        walk(&self.steps, &mut out);
        out
    }

    /// The Trait IDs of the Trait Steps, each once, in Workflow order.
    pub fn trait_ids(&self) -> Vec<Uuid> {
        let mut ids = Vec::new();
        for step in self.all_steps() {
            if let StepKind::Trait { trait_id } = step.kind {
                if !ids.contains(&trait_id) {
                    ids.push(trait_id);
                }
            }
        }
        ids
    }

    pub fn step(&self, id: &str) -> Option<&Step> {
        self.all_steps().into_iter().find(|s| s.id == id)
    }

    /// Whether running this Workflow asks the AI model for decisions.
    pub fn has_decisions(&self) -> bool {
        self.all_steps()
            .iter()
            .any(|s| matches!(s.kind, StepKind::Condition { .. } | StepKind::Loop { .. }))
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MiniMe {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub colors: MiniMeColors,
    pub avatar: MiniMeAvatar,
    pub group: MiniMeGroup,
    pub workflow: Workflow,
}

/// What the UI needs to list and show a Mini-Me.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MiniMeSummary {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub colors: MiniMeColors,
    pub avatar: MiniMeAvatar,
    pub group: MiniMeGroup,
    pub built_in: bool,
}

/// What the UI needs to list, show and edit a Trait.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TraitSummary {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub instructions: Option<String>,
    pub tools: Vec<String>,
    pub built_in: bool,
    /// Whether it runs on the prompt adapter, the only kind a duplicate can be made of.
    pub prompt_based: bool,
    /// The Mini-Mes whose Workflows run it.
    pub used_by: Vec<Uuid>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Library {
    pub(crate) traits: Vec<TraitDef>,
    pub(crate) mini_mes: Vec<MiniMe>,
    /// The IDs of the built-in definitions; every other entry is user-made.
    #[serde(skip)]
    built_in: Vec<Uuid>,
}

impl Library {
    /// The built-in library. Its content is checked by this module's tests, so parsing it
    /// cannot fail at run time.
    pub fn builtin() -> Self {
        let mut library: Self = serde_json::from_str(include_str!("../library/builtin.json"))
            .expect("library/builtin.json is valid");
        library.built_in = library.traits.iter().map(|t| t.id).collect();
        library.built_in.extend(library.mini_mes.iter().map(|m| m.id));
        debug_assert_eq!(library.problems(), Vec::<String>::new());
        library
    }

    pub fn is_built_in(&self, id: Uuid) -> bool {
        self.built_in.contains(&id)
    }

    pub fn mini_me(&self, id: Uuid) -> Option<&MiniMe> {
        self.mini_mes.iter().find(|m| m.id == id)
    }

    pub fn trait_def(&self, id: Uuid) -> Option<&TraitDef> {
        self.traits.iter().find(|t| t.id == id)
    }

    /// The definitions of the Traits a Workflow runs, each once, in Workflow order.
    pub fn workflow_traits(&self, workflow: &Workflow) -> Vec<&TraitDef> {
        workflow.trait_ids().into_iter().filter_map(|id| self.trait_def(id)).collect()
    }

    pub fn summaries(&self) -> Vec<MiniMeSummary> {
        self.mini_mes
            .iter()
            .map(|m| MiniMeSummary {
                id: m.id,
                name: m.name.clone(),
                description: m.description.clone(),
                colors: m.colors.clone(),
                avatar: m.avatar.clone(),
                group: m.group,
                built_in: self.is_built_in(m.id),
            })
            .collect()
    }

    /// Every Trait except the placeholders, which no Mini-Me may run.
    pub fn trait_summaries(&self) -> Vec<TraitSummary> {
        self.traits
            .iter()
            .filter(|t| t.adapter != "echo")
            .map(|t| TraitSummary {
                id: t.id,
                name: t.name.clone(),
                description: t.description.clone(),
                instructions: t.instructions.clone(),
                tools: t.tools.clone(),
                built_in: self.is_built_in(t.id),
                prompt_based: t.adapter == PROMPT_ADAPTER,
                used_by: self
                    .mini_mes
                    .iter()
                    .filter(|m| m.workflow.trait_ids().contains(&t.id))
                    .map(|m| m.id)
                    .collect(),
            })
            .collect()
    }

    /// Every problem with the definitions, empty when they are consistent.
    pub(crate) fn problems(&self) -> Vec<String> {
        let mut problems = Vec::new();
        let mut ids: Vec<Uuid> = self.traits.iter().map(|t| t.id).collect();
        ids.extend(self.mini_mes.iter().map(|m| m.id));
        let count = ids.len();
        ids.sort();
        ids.dedup();
        if ids.len() != count {
            problems.push("two definitions share an ID".to_string());
        }
        for (i, t) in self.traits.iter().enumerate() {
            let title_case = t.name.split(' ').all(|word| {
                word.chars().next().is_some_and(|c| c.is_uppercase() || c.is_ascii_digit())
            });
            if !title_case {
                problems.push(format!("Trait name {:?} is not in Title Case", t.name));
            }
            if self.traits[..i].iter().any(|other| same_name(&other.name, &t.name)) {
                problems.push(format!("two Traits are named {:?}", t.name));
            }
            if !self.is_built_in(t.id) {
                if t.adapter != PROMPT_ADAPTER {
                    problems.push(format!("Trait {} is user-made and must run on prompt", t.name));
                }
                if t.instructions.as_deref().is_none_or(|i| i.trim().is_empty()) {
                    problems.push(format!("Trait {} has no instructions", t.name));
                }
            }
            for tool in &t.tools {
                if !TOOLS.contains(&tool.as_str()) {
                    problems.push(format!("Trait {} lists the unknown tool {tool:?}", t.name));
                } else if t.adapter == PROMPT_ADAPTER && !MODEL_TOOLS.contains(&tool.as_str()) {
                    problems.push(format!(
                        "Trait {} runs on the prompt adapter and cannot list {tool:?}",
                        t.name
                    ));
                }
            }
        }
        for (i, m) in self.mini_mes.iter().enumerate() {
            if m.name.trim().is_empty() {
                problems.push("a Mini-Me has no name".to_string());
            } else if self.mini_mes[..i].iter().any(|other| same_name(&other.name, &m.name)) {
                problems.push(format!("two Mini-Mes are named {:?}", m.name));
            }
            // Routing chooses a Mini-Me by its description.
            if m.description.trim().is_empty() {
                problems.push(format!("{} has no description", m.name));
            }
            problems.extend(self.workflow_problems(m));
        }
        if self.mini_me(FALLBACK_MINI_ME).is_none() {
            problems.push("the fallback Mini-Me is missing".to_string());
        }
        problems
    }

    /// The problems with one Mini-Me's Workflow, each naming the Mini-Me and the Step.
    fn workflow_problems(&self, m: &MiniMe) -> Vec<String> {
        let mut problems = Vec::new();
        let steps = m.workflow.all_steps();
        if m.workflow.steps.is_empty() {
            problems.push(format!("{}'s Workflow has no Steps", m.name));
        }
        if !steps.iter().any(|s| matches!(s.kind, StepKind::Trait { .. })) {
            problems.push(format!("{}'s Workflow has no Trait Step", m.name));
        }
        let mut seen: Vec<&str> = Vec::new();
        for step in &steps {
            let at = format!("{}'s Step {:?}", m.name, step.id);
            if step.id.trim().is_empty() || seen.contains(&step.id.as_str()) {
                problems.push(format!("{at}: Step IDs must be unique and not empty"));
            }
            seen.push(&step.id);
            if step.label.as_deref().is_some_and(|l| l.trim().is_empty()) {
                problems.push(format!("{at}: the label is empty"));
            }
            match &step.kind {
                StepKind::Trait { trait_id } => match self.trait_def(*trait_id) {
                    None => problems.push(format!("{at} runs an unknown Trait {trait_id}")),
                    // Placeholder Traits run on `echo` until they are built, so no Mini-Me
                    // may offer them.
                    Some(t) if t.adapter == "echo" => {
                        problems.push(format!("{at} runs the placeholder Trait {}", t.name))
                    }
                    Some(_) => {}
                },
                StepKind::Approval { prompt } => {
                    if prompt.trim().is_empty() {
                        problems.push(format!("{at}: the prompt is empty"));
                    }
                }
                StepKind::Loop { question, max_iterations, steps } => {
                    if question.trim().is_empty() {
                        problems.push(format!("{at}: the question is empty"));
                    }
                    if !(1..=10).contains(max_iterations) {
                        problems.push(format!("{at}: max_iterations must be from 1 to 10"));
                    }
                    if steps.is_empty() {
                        problems.push(format!("{at} has no Steps"));
                    }
                }
                StepKind::Condition { question, branches } => {
                    if question.trim().is_empty() {
                        problems.push(format!("{at}: the question is empty"));
                    }
                    problems.extend(branch_problems(&at, branches));
                }
                StepKind::Parallel { branches } => problems.extend(branch_problems(&at, branches)),
            }
        }
        problems
    }
}

/// Whether two names are the same, ignoring case.
fn same_name(a: &str, b: &str) -> bool {
    a.to_lowercase() == b.to_lowercase()
}

fn branch_problems(at: &str, branches: &[Branch]) -> Vec<String> {
    let mut problems = Vec::new();
    if branches.len() < 2 {
        problems.push(format!("{at} needs at least two branches"));
    }
    for (i, branch) in branches.iter().enumerate() {
        if branch.label.trim().is_empty() {
            problems.push(format!("{at}: a branch label is empty"));
        } else if branches[..i].iter().any(|b| b.label == branch.label) {
            problems.push(format!("{at}: two branches are labelled {:?}", branch.label));
        }
        if branch.steps.is_empty() {
            problems.push(format!("{at}: branch {:?} has no Steps", branch.label));
        }
    }
    problems
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
                "Explore Dataverse",
                "Code",
                "Collect Data",
                "Model",
                "Predict",
                "Index Sources",
                "Profile Data",
                "Validate Data",
                "Clean Data",
                "Join Data",
                "Plot",
            ]
        );
    }

    #[test]
    fn built_in_traits_list_their_tools() {
        let library = Library::builtin();
        let lists: Vec<(&str, Vec<&str>)> = library
            .traits
            .iter()
            .filter(|t| !t.tools.is_empty())
            .map(|t| (t.name.as_str(), t.tools.iter().map(String::as_str).collect()))
            .collect();
        let table = vec!["read_table", "show_table", "save_file"];
        assert_eq!(
            lists,
            [
                ("Summarize", vec!["write_document"]),
                ("Assist", vec!["save_file", "show_table", "write_document"]),
                ("Find Papers", vec!["show_papers"]),
                ("Theorize", vec!["show_theories", "save_file"]),
                ("Profile Data", vec!["read_table", "show_table"]),
                ("Validate Data", table.clone()),
                ("Clean Data", table.clone()),
                ("Join Data", table),
                ("Plot", vec!["read_table", "show_chart"]),
            ]
        );
    }

    #[test]
    fn unknown_tools_and_non_model_tools_on_prompt_traits_are_reported() {
        let mut library = Library::builtin();
        let assist = library.traits.iter_mut().find(|t| t.name == "Assist").unwrap();
        assist.tools = vec!["show_chart".into(), "teleport".into()];
        let problems = library.problems();
        assert!(problems.iter().any(|p| p.contains("cannot list \"show_chart\"")));
        assert!(problems.iter().any(|p| p.contains("unknown tool \"teleport\"")));
    }

    #[test]
    fn summaries_mark_built_ins_and_list_the_users_of_a_trait() {
        let library = Library::builtin();
        let skeptic = library.summaries().into_iter().find(|m| m.name == "Skeptic").unwrap();
        assert!(skeptic.built_in);
        let traits = library.trait_summaries();
        let refute = traits.iter().find(|t| t.name == "Refute").unwrap();
        assert!(refute.built_in && refute.prompt_based);
        assert!(refute.used_by.contains(&skeptic.id));
        assert!(!traits.iter().find(|t| t.name == "Find Papers").unwrap().prompt_based);
        assert!(!traits.iter().any(|t| t.name == "Code"));
    }

    #[test]
    fn mini_mes_have_groups() {
        let summaries = Library::builtin().summaries();
        let group = |name: &str| summaries.iter().find(|m| m.name == name).unwrap().group;
        assert_eq!(group("Profiler"), MiniMeGroup::Data);
        assert_eq!(group("Researcher"), MiniMeGroup::Literature);
        assert_eq!(group("Skeptic"), MiniMeGroup::Thinking);
    }

    #[test]
    fn an_unknown_group_fails_to_load() {
        let mut json: serde_json::Value =
            serde_json::from_str(include_str!("../library/builtin.json")).unwrap();
        json["mini_mes"][0]["group"] = "other".into();
        let error = serde_json::from_value::<Library>(json).unwrap_err().to_string();
        assert!(error.contains("unknown variant"), "{error}");
    }

    #[test]
    fn mini_mes_run_their_step_trait() {
        let library = Library::builtin();
        let step = |name: &str| {
            let summary = library.summaries().into_iter().find(|m| m.name == name).unwrap();
            let mini_me = library.mini_me(summary.id).unwrap();
            let traits = library.workflow_traits(&mini_me.workflow);
            assert_eq!(traits.len(), 1, "{name} runs one Trait");
            traits[0].clone()
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
        for (mini_me, name, adapter) in [
            ("Profiler", "Profile Data", "data-profile"),
            ("Validator", "Validate Data", "data-validate"),
            ("Curator", "Clean Data", "data-clean"),
            ("Linker", "Join Data", "data-join"),
            ("Plotter", "Plot", "data-plot"),
        ] {
            let t = step(mini_me);
            assert_eq!((t.name.as_str(), t.adapter.as_str()), (name, adapter));
        }
    }

    #[test]
    fn fifteen_mini_mes_ship_and_investigator_uses_every_control_step() {
        let library = Library::builtin();
        let names: Vec<String> = library.summaries().into_iter().map(|m| m.name).collect();
        assert_eq!(names.len(), 15);
        assert_eq!(names.last().map(String::as_str), Some("Investigator"));

        let investigator = library.mini_mes.iter().find(|m| m.name == "Investigator").unwrap();
        let workflow = &investigator.workflow;
        let types: Vec<&str> = workflow.steps.iter().map(|s| s.type_name()).collect();
        assert_eq!(types, ["parallel", "trait", "loop", "condition"]);
        assert!(workflow.all_steps().iter().any(|s| s.type_name() == "approval"));
        let traits: Vec<&str> =
            library.workflow_traits(workflow).iter().map(|t| t.name.as_str()).collect();
        assert_eq!(traits, ["Scout", "Wonder", "Plan", "Refute", "Experiment"]);
        assert!(matches!(
            workflow.step("stress-test").map(|s| &s.kind),
            Some(StepKind::Loop { max_iterations: 2, .. })
        ));
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
        let code = library.traits.iter().find(|t| t.name == "Code").unwrap().id;
        library.mini_mes[1].workflow.steps[0].kind = StepKind::Trait { trait_id: code };
        let problems = library.problems();
        assert!(problems.iter().any(|p| p.contains("share an ID")));
        assert!(problems.iter().any(|p| p.contains("Title Case")));
        assert!(problems.iter().any(|p| p.contains("has no Steps")));
        assert!(problems.iter().any(|p| p.contains("placeholder Trait Code")));
    }

    #[test]
    fn the_fallback_is_assistant_and_must_exist() {
        let mut library = Library::builtin();
        assert_eq!(library.mini_me(FALLBACK_MINI_ME).unwrap().name, "Assistant");
        library.mini_mes.retain(|m| m.id != FALLBACK_MINI_ME);
        assert!(library.problems().iter().any(|p| p.contains("fallback Mini-Me is missing")));
    }

    /// A valid user-made Trait named `name`.
    pub(crate) fn user_trait(name: &str) -> TraitDef {
        TraitDef {
            id: Uuid::now_v7(),
            name: name.into(),
            description: "Translates text.".into(),
            color: "oklch(0.8 0 0)".into(),
            adapter: PROMPT_ADAPTER.into(),
            instructions: Some("Translate the message.".into()),
            tools: vec![],
        }
    }

    #[test]
    fn names_are_unique_and_in_title_case_with_digits() {
        let mut library = Library::builtin();
        library.traits.push(user_trait("Plan Copy 2"));
        assert_eq!(library.problems(), Vec::<String>::new());

        library.traits.push(user_trait("translate text"));
        library.traits.push(user_trait("plan"));
        let mut skeptic = library.mini_mes.iter().find(|m| m.name == "Skeptic").unwrap().clone();
        skeptic.id = Uuid::now_v7();
        skeptic.name = "skeptic".into();
        library.mini_mes.push(skeptic);
        let problems = library.problems();
        assert!(problems.iter().any(|p| p.contains("\"translate text\" is not in Title Case")));
        assert!(problems.iter().any(|p| p.contains("two Traits are named \"plan\"")));
        assert!(problems.iter().any(|p| p.contains("two Mini-Mes are named \"skeptic\"")));
    }

    #[test]
    fn user_made_traits_run_on_prompt_with_instructions() {
        let mut library = Library::builtin();
        let mut plot = user_trait("My Plot");
        plot.adapter = "data-plot".into();
        let mut empty = user_trait("Empty");
        empty.instructions = Some(" ".into());
        library.traits.extend([plot, empty]);
        let problems = library.problems();
        assert!(problems.iter().any(|p| p.contains("My Plot is user-made and must run on prompt")));
        assert!(problems.iter().any(|p| p.contains("Empty has no instructions")));
        // Built-in Traits on other adapters stay valid.
        assert_eq!(problems.len(), 2, "{problems:?}");
    }

    const SCOUT: &str = "5f0c8a2e-6d1b-4b7e-9a43-2c8e1f0d7a06";
    const WONDER: &str = "5f0c8a2e-6d1b-4b7e-9a43-2c8e1f0d7a09";

    fn with_workflow(workflow: serde_json::Value) -> Library {
        let mut library = Library::builtin();
        library.mini_mes[0].workflow = serde_json::from_value(workflow).unwrap();
        library
    }

    #[test]
    fn a_step_without_type_is_a_trait_step() {
        let workflow: Workflow =
            serde_json::from_value(serde_json::json!({ "steps": [{ "id": "scout", "trait": SCOUT }] }))
                .unwrap();
        let trait_id = SCOUT.parse().unwrap();
        assert_eq!(workflow.steps[0].kind, StepKind::Trait { trait_id });
        let sent = serde_json::to_value(&workflow).unwrap();
        assert_eq!(sent["steps"][0]["type"], "trait");
    }

    #[test]
    fn nested_steps_are_parsed_and_listed_in_order() {
        let library = with_workflow(serde_json::json!({ "steps": [
            { "id": "open-up", "type": "parallel", "branches": [
                { "label": "Directions", "steps": [{ "id": "scout", "trait": SCOUT }] },
                { "label": "Questions", "steps": [{ "id": "wonder", "trait": WONDER }] } ] },
            { "id": "again", "type": "loop", "question": "Again?", "max_iterations": 2,
              "steps": [{ "id": "ask", "type": "approval", "prompt": "Go on?" },
                        { "id": "scout-again", "trait": SCOUT }] } ] }));
        assert_eq!(library.problems(), Vec::<String>::new());
        let workflow = &library.mini_mes[0].workflow;
        let ids: Vec<&str> = workflow.all_steps().iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, ["open-up", "scout", "wonder", "again", "ask", "scout-again"]);
        let names: Vec<&str> =
            library.workflow_traits(workflow).iter().map(|t| t.name.as_str()).collect();
        assert_eq!(names, ["Scout", "Wonder"]);
        assert!(workflow.has_decisions());
    }

    #[test]
    fn broken_workflows_are_reported() {
        let unknown = with_workflow(serde_json::json!({ "steps": [
            { "id": "split", "type": "parallel", "branches": [
                { "label": "A", "steps": [{ "id": "a", "trait": SCOUT }] },
                { "label": "B", "steps": [{ "id": "b", "trait": Uuid::nil() }] } ] } ] }));
        assert!(unknown.problems().iter().any(|p| p.contains("Step \"b\" runs an unknown Trait")));

        let duplicate = with_workflow(serde_json::json!({ "steps": [
            { "id": "scout", "trait": SCOUT }, { "id": "scout", "trait": WONDER } ] }));
        assert!(duplicate.problems().iter().any(|p| p.contains("must be unique")));

        let endless = with_workflow(serde_json::json!({ "steps": [
            { "id": "again", "type": "loop", "question": "Again?", "max_iterations": 0,
              "steps": [{ "id": "scout", "trait": SCOUT }] } ] }));
        assert!(endless.problems().iter().any(|p| p.contains("max_iterations")));

        let lonely = with_workflow(serde_json::json!({ "steps": [
            { "id": "pick", "type": "condition", "question": "Which?",
              "branches": [{ "label": "only", "steps": [{ "id": "scout", "trait": SCOUT }] }] } ] }));
        assert!(lonely.problems().iter().any(|p| p.contains("at least two branches")));
    }
}
