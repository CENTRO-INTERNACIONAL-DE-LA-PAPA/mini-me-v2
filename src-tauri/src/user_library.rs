//! User-made Mini-Mes and Traits, stored app-wide in `user-library.json` in the Mini-Me Data
//! folder and merged with the built-in library. The file never lives in a Project folder, and
//! no Trait tool can address it.

use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::library::{Library, MiniMe, PROMPT_ADAPTER, TraitDef};

pub const FILE_NAME: &str = "user-library.json";

/// The fill every user-made Trait gets. Trait colours are not shown, but the format keeps the
/// field.
const TRAIT_COLOR: &str = "oklch(0.86 0 0)";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EntryKind {
    Trait,
    MiniMe,
}

/// A user-made entry that broke a rule when the file was loaded. Saves write it back
/// unchanged, so fixing the file by hand recovers it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Skipped {
    pub kind: EntryKind,
    pub name: Option<String>,
    pub problems: Vec<String>,
    #[serde(skip)]
    raw: Value,
}

/// What the user edits of a Trait; the core fills in the rest, so a user-made Trait always
/// runs on the prompt adapter.
#[derive(Debug, Clone, Deserialize)]
pub struct TraitDraft {
    /// Nil for a new Trait.
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub instructions: String,
    pub tools: Vec<String>,
}

#[derive(Default, Deserialize)]
struct RawFile {
    #[serde(default)]
    traits: Vec<Value>,
    #[serde(default)]
    mini_mes: Vec<Value>,
}

struct State {
    library: Arc<Library>,
    skipped: Vec<Skipped>,
    /// Why the file could not be read. While set, edits are refused so the file is not
    /// overwritten.
    unreadable: Option<String>,
}

/// The library in use. Readers take a snapshot with `current()`, which an edit never changes:
/// an edit swaps in a new library only after the file is written.
pub struct LibraryStore {
    path: PathBuf,
    state: RwLock<State>,
}

impl LibraryStore {
    /// The built-in library merged with `user-library.json` in `data_root`.
    pub fn open(data_root: &Path) -> Self {
        let path = data_root.join(FILE_NAME);
        let state = load(&path);
        Self { path, state: RwLock::new(state) }
    }

    /// The built-in library alone, with a file path that cannot be written.
    #[cfg(test)]
    pub fn builtin() -> Arc<Self> {
        Arc::new(Self {
            path: PathBuf::new(),
            state: RwLock::new(State {
                library: Arc::new(Library::builtin()),
                skipped: Vec::new(),
                unreadable: None,
            }),
        })
    }

    pub fn current(&self) -> Arc<Library> {
        Arc::clone(&self.read().library)
    }

    pub fn skipped(&self) -> Vec<Skipped> {
        self.read().skipped.clone()
    }

    pub fn unreadable(&self) -> Option<String> {
        self.read().unreadable.clone()
    }

    /// Creates or replaces a user-made Trait, returning it as saved.
    pub fn save_trait(&self, draft: TraitDraft) -> AppResult<TraitDef> {
        let id = if draft.id.is_nil() { Uuid::now_v7() } else { draft.id };
        let saved = TraitDef {
            id,
            name: draft.name.trim().to_string(),
            description: draft.description.trim().to_string(),
            color: TRAIT_COLOR.to_string(),
            adapter: PROMPT_ADAPTER.to_string(),
            instructions: Some(draft.instructions),
            tools: draft.tools,
        };
        let entry = saved.clone();
        self.edit(move |library| {
            refuse_built_in(library, id)?;
            match library.traits.iter_mut().find(|t| t.id == id) {
                Some(existing) => *existing = entry,
                None => library.traits.push(entry),
            }
            Ok(())
        })?;
        Ok(saved)
    }

    /// Creates or replaces a user-made Mini-Me, returning it as saved.
    pub fn save_mini_me(&self, mut mini_me: MiniMe) -> AppResult<MiniMe> {
        if mini_me.id.is_nil() {
            mini_me.id = Uuid::now_v7();
        }
        mini_me.name = mini_me.name.trim().to_string();
        mini_me.description = mini_me.description.trim().to_string();
        let entry = mini_me.clone();
        self.edit(move |library| {
            refuse_built_in(library, entry.id)?;
            match library.mini_mes.iter_mut().find(|m| m.id == entry.id) {
                Some(existing) => *existing = entry,
                None => library.mini_mes.push(entry),
            }
            Ok(())
        })?;
        Ok(mini_me)
    }

    /// Deletes a user-made Trait, refusing while a Mini-Me runs it.
    pub fn delete_trait(&self, id: Uuid) -> AppResult<()> {
        self.edit(|library| {
            refuse_built_in(library, id)?;
            let name = library
                .trait_def(id)
                .ok_or_else(|| AppError::not_found("Trait not found"))?
                .name
                .clone();
            let users: Vec<&str> = library
                .mini_mes
                .iter()
                .filter(|m| m.workflow.trait_ids().contains(&id))
                .map(|m| m.name.as_str())
                .collect();
            if !users.is_empty() {
                return Err(AppError::invalid_input(format!(
                    "{name} is still used by {}",
                    users.join(", ")
                )));
            }
            library.traits.retain(|t| t.id != id);
            Ok(())
        })
    }

    pub fn delete_mini_me(&self, id: Uuid) -> AppResult<()> {
        self.edit(|library| {
            refuse_built_in(library, id)?;
            if library.mini_me(id).is_none() {
                return Err(AppError::not_found("Mini-Me not found"));
            }
            library.mini_mes.retain(|m| m.id != id);
            Ok(())
        })
    }

    /// Applies `change` to a copy of the library, checks it, writes the file, and only then
    /// makes the copy current.
    fn edit(&self, change: impl FnOnce(&mut Library) -> AppResult<()>) -> AppResult<()> {
        let mut state = self.state.write().unwrap_or_else(|e| e.into_inner());
        if let Some(reason) = &state.unreadable {
            return Err(AppError::storage(format!(
                "{FILE_NAME} could not be read, so it is not changed: {reason}"
            )));
        }
        let mut library = (*state.library).clone();
        change(&mut library)?;
        let problems = library.problems();
        if !problems.is_empty() {
            return Err(AppError::invalid_input(problems.join("\n")));
        }
        write(&self.path, &library, &state.skipped)?;
        state.library = Arc::new(library);
        Ok(())
    }

    fn read(&self) -> std::sync::RwLockReadGuard<'_, State> {
        self.state.read().unwrap_or_else(|e| e.into_inner())
    }
}

fn refuse_built_in(library: &Library, id: Uuid) -> AppResult<()> {
    if library.is_built_in(id) {
        return Err(AppError::invalid_input("Built-in definitions can only be duplicated"));
    }
    Ok(())
}

/// The built-in library plus each user-made entry that adds no problem. Traits come first,
/// so a Mini-Me that runs a skipped Trait is skipped too.
fn load(path: &Path) -> State {
    let mut library = Library::builtin();
    let mut skipped = Vec::new();
    let unreadable = |reason: String| State {
        library: Arc::new(Library::builtin()),
        skipped: Vec::new(),
        unreadable: Some(reason),
    };
    let raw: RawFile = match std::fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str(&text) {
            Ok(raw) => raw,
            Err(e) => return unreadable(e.to_string()),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => RawFile::default(),
        Err(e) => return unreadable(e.to_string()),
    };
    for value in raw.traits {
        let problems = match serde_json::from_value::<TraitDef>(value.clone()) {
            Ok(t) => {
                library.traits.push(t);
                let problems = library.problems();
                if !problems.is_empty() {
                    library.traits.pop();
                }
                problems
            }
            Err(e) => vec![e.to_string()],
        };
        if !problems.is_empty() {
            skipped.push(Skipped { kind: EntryKind::Trait, name: name_of(&value), problems, raw: value });
        }
    }
    for value in raw.mini_mes {
        let problems = match serde_json::from_value::<MiniMe>(value.clone()) {
            Ok(m) => {
                library.mini_mes.push(m);
                let problems = library.problems();
                if !problems.is_empty() {
                    library.mini_mes.pop();
                }
                problems
            }
            Err(e) => vec![e.to_string()],
        };
        if !problems.is_empty() {
            skipped.push(Skipped { kind: EntryKind::MiniMe, name: name_of(&value), problems, raw: value });
        }
    }
    State { library: Arc::new(library), skipped, unreadable: None }
}

fn name_of(value: &Value) -> Option<String> {
    value.get("name").and_then(Value::as_str).map(str::to_string)
}

/// Writes the user-made entries, then the skipped ones unchanged, through a temporary file so
/// a failed write leaves the previous file whole.
fn write(path: &Path, library: &Library, skipped: &[Skipped]) -> AppResult<()> {
    let raw_of = |kind| skipped.iter().filter(move |s| s.kind == kind).map(|s| s.raw.clone());
    let mut traits = Vec::new();
    for t in library.traits.iter().filter(|t| !library.is_built_in(t.id)) {
        traits.push(serde_json::to_value(t)?);
    }
    traits.extend(raw_of(EntryKind::Trait));
    let mut mini_mes = Vec::new();
    for m in library.mini_mes.iter().filter(|m| !library.is_built_in(m.id)) {
        mini_mes.push(serde_json::to_value(m)?);
    }
    mini_mes.extend(raw_of(EntryKind::MiniMe));
    let json = serde_json::json!({ "traits": traits, "mini_mes": mini_mes });
    let tmp = path.with_file_name(format!("{FILE_NAME}.tmp"));
    std::fs::write(&tmp, serde_json::to_string_pretty(&json)?)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::{Step, StepKind, Workflow};

    const SKEPTIC: &str = "5f0c8a2e-6d1b-4b7e-9a43-2c8e1f0d7b07";

    fn draft(name: &str) -> TraitDraft {
        TraitDraft {
            id: Uuid::nil(),
            name: name.into(),
            description: "Translates text.".into(),
            instructions: "Translate the message.".into(),
            tools: vec!["save_file".into()],
        }
    }

    /// A user-made Mini-Me running `traits`, modelled on Skeptic.
    fn mini_me(library: &Library, name: &str, traits: &[Uuid]) -> MiniMe {
        let mut m = library.mini_me(SKEPTIC.parse().unwrap()).unwrap().clone();
        m.id = Uuid::nil();
        m.name = name.into();
        m.workflow = Workflow {
            steps: traits
                .iter()
                .enumerate()
                .map(|(i, id)| Step {
                    id: format!("step-{i}"),
                    label: None,
                    kind: StepKind::Trait { trait_id: *id },
                })
                .collect(),
        };
        m
    }

    fn names(library: &Library) -> Vec<String> {
        library.summaries().into_iter().map(|m| m.name).collect()
    }

    #[test]
    fn saved_definitions_are_reloaded_from_disk() {
        let dir = tempfile::tempdir().unwrap();
        let store = LibraryStore::open(dir.path());
        let translate = store.save_trait(draft("Translate")).unwrap();
        assert!(!translate.id.is_nil());
        assert_eq!(translate.adapter, "prompt");
        let m = mini_me(&store.current(), "Field Translator", &[translate.id]);
        store.save_mini_me(m).unwrap();

        let reloaded = LibraryStore::open(dir.path()).current();
        assert_eq!(reloaded.trait_def(translate.id), Some(&translate));
        assert_eq!(names(&reloaded).last().map(String::as_str), Some("Field Translator"));
        assert!(!reloaded.is_built_in(translate.id));
    }

    #[test]
    fn a_missing_file_gives_the_built_ins() {
        let dir = tempfile::tempdir().unwrap();
        let store = LibraryStore::open(dir.path());
        assert_eq!(names(&store.current()).len(), 15);
        assert_eq!((store.skipped(), store.unreadable()), (vec![], None));
    }

    #[test]
    fn broken_entries_are_skipped_and_kept_in_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let store = LibraryStore::open(dir.path());
        let library = store.current();
        let plan = library.traits.iter().find(|t| t.name == "Plan").unwrap().id;
        let charts = serde_json::to_value(TraitDef {
            id: Uuid::now_v7(),
            name: "Chart".into(),
            description: "Draws.".into(),
            color: TRAIT_COLOR.into(),
            adapter: "prompt".into(),
            instructions: Some("Draw.".into()),
            tools: vec!["show_chart".into()],
        })
        .unwrap();
        let mut runs_chart = mini_me(&library, "Charter", &[plan]);
        runs_chart.id = Uuid::now_v7();
        if let StepKind::Trait { trait_id } = &mut runs_chart.workflow.steps[0].kind {
            *trait_id = charts["id"].as_str().unwrap().parse().unwrap();
        }
        let mut empty = mini_me(&library, "Empty", &[plan]);
        empty.id = Uuid::now_v7();
        empty.workflow.steps.clear();
        let mut grouped = serde_json::to_value(mini_me(&library, "Grouped", &[plan])).unwrap();
        grouped["id"] = Uuid::now_v7().to_string().into();
        grouped["group"] = "other".into();
        let file = serde_json::json!({
            "traits": [charts],
            "mini_mes": [runs_chart, empty, grouped],
        });
        std::fs::write(dir.path().join(FILE_NAME), file.to_string()).unwrap();

        let store = LibraryStore::open(dir.path());
        let skipped: Vec<_> =
            store.skipped().into_iter().map(|s| (s.kind, s.name.unwrap())).collect();
        assert_eq!(
            skipped,
            [
                (EntryKind::Trait, "Chart".to_string()),
                (EntryKind::MiniMe, "Charter".to_string()),
                (EntryKind::MiniMe, "Empty".to_string()),
                (EntryKind::MiniMe, "Grouped".to_string()),
            ]
        );
        assert!(store.skipped()[0].problems[0].contains("cannot list \"show_chart\""));
        assert_eq!(names(&store.current()).len(), 15);

        store.save_trait(draft("Translate")).unwrap();
        let written: Value =
            serde_json::from_str(&std::fs::read_to_string(dir.path().join(FILE_NAME)).unwrap())
                .unwrap();
        assert_eq!(written["traits"][1], file["traits"][0]);
        assert_eq!(written["mini_mes"], file["mini_mes"]);
    }

    #[test]
    fn invalid_json_makes_the_store_read_only() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(FILE_NAME), "{ not json").unwrap();
        let store = LibraryStore::open(dir.path());
        assert!(store.unreadable().is_some());
        assert_eq!(names(&store.current()).len(), 15);
        let error = store.save_trait(draft("Translate")).unwrap_err();
        assert_eq!(error.code, "storage");
        assert_eq!(std::fs::read_to_string(dir.path().join(FILE_NAME)).unwrap(), "{ not json");
    }

    #[test]
    fn built_ins_cannot_be_saved_or_deleted() {
        let dir = tempfile::tempdir().unwrap();
        let store = LibraryStore::open(dir.path());
        let skeptic = store.current().mini_me(SKEPTIC.parse().unwrap()).unwrap().clone();
        assert!(store.save_mini_me(skeptic).unwrap_err().message.contains("only be duplicated"));
        let refute = store.current().traits.iter().find(|t| t.name == "Refute").unwrap().id;
        assert!(store.delete_trait(refute).is_err());
        assert!(!dir.path().join(FILE_NAME).exists());
    }

    #[test]
    fn a_trait_in_use_is_not_deleted() {
        let dir = tempfile::tempdir().unwrap();
        let store = LibraryStore::open(dir.path());
        let translate = store.save_trait(draft("Translate")).unwrap();
        let m = mini_me(&store.current(), "Field Translator", &[translate.id]);
        let m = store.save_mini_me(m).unwrap();
        let error = store.delete_trait(translate.id).unwrap_err();
        assert_eq!(error.message, "Translate is still used by Field Translator");

        store.delete_mini_me(m.id).unwrap();
        store.delete_trait(translate.id).unwrap();
        assert!(store.current().trait_def(translate.id).is_none());
    }

    #[test]
    fn a_save_with_problems_is_refused_and_changes_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let store = LibraryStore::open(dir.path());
        let mut bad = draft("translate");
        bad.instructions = String::new();
        let error = store.save_trait(bad).unwrap_err();
        assert!(error.message.contains("Title Case"), "{}", error.message);
        assert!(error.message.contains("no instructions"), "{}", error.message);
        assert!(!dir.path().join(FILE_NAME).exists());
    }

    #[test]
    fn a_snapshot_keeps_the_definitions_it_was_taken_with() {
        let dir = tempfile::tempdir().unwrap();
        let store = LibraryStore::open(dir.path());
        let before = store.current();
        let translate = store.save_trait(draft("Translate")).unwrap();
        assert!(before.trait_def(translate.id).is_none());
        assert!(store.current().trait_def(translate.id).is_some());
    }
}
