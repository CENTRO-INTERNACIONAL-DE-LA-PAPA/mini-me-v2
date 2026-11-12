//! Quarto, the user's own install: finding it, checking its version, and rendering a source to a
//! PDF or page images. It is optional: without it only document work is blocked. It never runs
//! code (`--no-execute`) and works in a temporary folder inside the Project, removed afterwards.

use std::ffi::OsStr;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::assets;
use crate::error::{AppError, AppResult};
use crate::protocol::{AssetRef, new_id};
use crate::store::Project;
use crate::sync::locked;

/// The oldest Quarto the app renders with: the version `keep-typ` and `quarto typst compile` were
/// checked on.
pub const MINIMUM: (u32, u32) = (1, 10);

const INSTALL_URL: &str = "https://quarto.org/docs/download/";
/// The error code for a Quarto that could not start, meaning it was moved or removed.
pub const NOT_STARTED: &str = "quarto_not_started";
const VERSION_LIMIT: Duration = Duration::from_secs(10);
const RENDER_LIMIT: Duration = Duration::from_secs(120);
const PAGES_LIMIT: Duration = Duration::from_secs(60);
/// The file names a render uses, which a Project file of the same name must not replace.
const RESERVED: [&str; 3] = ["document.qmd", "document.pdf", "document.typ"];
/// Shortcodes that read files or the environment, which `--no-execute` does not stop.
const REFUSED_SHORTCODES: [&str; 3] = ["include", "embed", "env"];
/// Header keys that run filters or insert whole files into the output.
const REFUSED_KEYS: [&str; 7] = [
    "filters",
    "shortcodes",
    "include-in-header",
    "include-before-body",
    "include-after-body",
    "template",
    "template-partials",
];
/// The program names looked for in each folder of the PATH.
const NAMES: &[&str] = if cfg!(windows) { &["quarto.exe", "quarto.cmd"] } else { &["quarto"] };

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum State {
    Found,
    Missing,
    TooOld,
    /// Found, but its version could not be read.
    Broken,
}

/// What the app knows about the user's Quarto, as Settings and the document view show it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Status {
    pub state: State,
    pub version: Option<String>,
    pub path: Option<String>,
    /// Whether `path` was chosen in Settings rather than found.
    pub chosen: bool,
    pub minimum: String,
    pub install_url: String,
}

impl Status {
    fn new(state: State, version: Option<String>, path: Option<&Path>, chosen: bool) -> Self {
        Self {
            state,
            version,
            path: path.map(|p| p.display().to_string()),
            chosen,
            minimum: format!("{}.{}", MINIMUM.0, MINIMUM.1),
            install_url: INSTALL_URL.to_string(),
        }
    }

    /// `None` when Quarto is usable.
    fn blocking(&self) -> Option<AppError> {
        let message = match self.state {
            State::Found => return None,
            State::Missing => format!(
                "Quarto is needed to work with documents. Install it from {INSTALL_URL} and \
                 try again."
            ),
            State::TooOld => format!(
                "Quarto {} is too old for documents; version {} or later is needed. Install a \
                 newer one from {INSTALL_URL}.",
                self.version.as_deref().unwrap_or("?"),
                self.minimum
            ),
            State::Broken => format!(
                "Quarto could not be run at {}. Check its location in Settings.",
                self.path.as_deref().unwrap_or("its location")
            ),
        };
        Some(AppError::new("quarto_missing", message))
    }
}

/// The version in the output of `quarto --version`, such as `1.10.18`.
pub fn parse_version(output: &str) -> Option<(u32, u32, u32)> {
    let word = output.split_whitespace().next()?;
    let mut parts = word.split('.').map(|p| p.parse::<u32>().ok());
    Some((parts.next()??, parts.next()??, parts.next()??))
}

/// The usual places the operating system's Quarto installer puts the program.
fn install_candidates() -> Vec<PathBuf> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from);
    let env = |name: &str| std::env::var_os(name).map(PathBuf::from);
    let mut found = Vec::new();
    if cfg!(target_os = "macos") {
        found.push(PathBuf::from("/Applications/quarto/bin/quarto"));
        found.extend(home.as_ref().map(|h| h.join("Applications/quarto/bin/quarto")));
    }
    if cfg!(windows) {
        found.extend(env("LOCALAPPDATA").map(|d| d.join(r"Programs\Quarto\bin\quarto.exe")));
        found.extend(env("ProgramFiles").map(|d| d.join(r"Quarto\bin\quarto.exe")));
    }
    if cfg!(target_os = "linux") {
        found.push(PathBuf::from("/usr/local/bin/quarto"));
        found.push(PathBuf::from("/opt/quarto/bin/quarto"));
        found.extend(home.as_ref().map(|h| h.join(".local/bin/quarto")));
    }
    found
}

/// The `setting` from Settings, else the first Quarto on the PATH, else the first of `candidates`.
/// A chosen path is returned even when missing, so it is reported as broken rather than ignored.
pub fn locate(
    setting: Option<&str>,
    path_var: Option<&OsStr>,
    candidates: &[PathBuf],
) -> Option<PathBuf> {
    if let Some(chosen) = setting.map(str::trim).filter(|s| !s.is_empty()) {
        return Some(PathBuf::from(chosen));
    }
    let on_path = path_var.into_iter().flat_map(std::env::split_paths).find_map(|dir| {
        NAMES.iter().map(|name| dir.join(name)).find(|candidate| candidate.is_file())
    });
    on_path.or_else(|| candidates.iter().find(|c| c.is_file()).cloned())
}

/// Looked up afresh each time, so a Quarto installed or moved since is seen.
pub fn status(setting: Option<&str>) -> Status {
    let path_var = std::env::var_os("PATH");
    let chosen = setting.is_some_and(|s| !s.trim().is_empty());
    let found = locate(setting, path_var.as_deref(), &install_candidates());
    let Some(program) = found else {
        return Status::new(State::Missing, None, None, false);
    };
    let output = match run_limited(command(&program, &["--version"], None), VERSION_LIMIT) {
        Ok(finished) if finished.success => finished.output,
        _ => return Status::new(State::Broken, None, Some(&program), chosen),
    };
    match parse_version(&output) {
        None => Status::new(State::Broken, None, Some(&program), chosen),
        Some((major, minor, patch)) => {
            let version = format!("{major}.{minor}.{patch}");
            let state = if (major, minor) >= MINIMUM { State::Found } else { State::TooOld };
            Status::new(state, Some(version), Some(&program), chosen)
        }
    }
}

/// The Quarto as last looked up, which document actions read instead of looking again. Looked up
/// again only when the user asks, changes the location, or a render cannot start it.
pub struct Known {
    lookup: Box<dyn Fn(Option<&str>) -> Status + Send + Sync>,
    /// The location chosen in Settings, and the status found for it so far.
    state: Mutex<(Option<String>, Option<Status>)>,
}

impl Known {
    pub fn new(setting: Option<String>) -> Self {
        Self::with_lookup(setting, Box::new(status))
    }

    fn with_lookup(
        setting: Option<String>,
        lookup: Box<dyn Fn(Option<&str>) -> Status + Send + Sync>,
    ) -> Self {
        Self { lookup, state: Mutex::new((setting, None)) }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, (Option<String>, Option<Status>)> {
        locked(&self.state)
    }

    /// Looks it up first if it never was, without the lock, since the lookup can take seconds.
    pub fn status(&self) -> Status {
        let setting = {
            let state = self.lock();
            if let Some(found) = &state.1 {
                return found.clone();
            }
            state.0.clone()
        };
        let found = (self.lookup)(setting.as_deref());
        self.lock().1.get_or_insert(found).clone()
    }

    /// Looks Quarto up again, as when the user asks or a render could not start it.
    pub fn refresh(&self) -> Status {
        let setting = self.lock().0.clone();
        let found = (self.lookup)(setting.as_deref());
        self.lock().1 = Some(found.clone());
        found
    }

    /// Uses the location chosen in Settings, or none to search, and looks again.
    pub fn set_setting(&self, setting: Option<String>) -> Status {
        self.lock().0 = setting;
        self.refresh()
    }

    /// The program to render with, or the error saying why document work is blocked.
    pub fn require(&self) -> AppResult<PathBuf> {
        let status = self.status();
        match status.blocking() {
            Some(error) => Err(error),
            None => Ok(PathBuf::from(status.path.unwrap_or_default())),
        }
    }
}

/// `program` with `args`, started in `dir` when given, without a console window on Windows.
fn command(program: &Path, args: &[&str], dir: Option<&Path>) -> Command {
    let mut command = Command::new(program);
    command.args(args);
    if let Some(dir) = dir {
        command.current_dir(dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

struct Finished {
    success: bool,
    output: String,
}

fn drain<R: Read + Send + 'static>(mut stream: R) -> JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stream.read_to_end(&mut bytes);
        bytes
    })
}

/// Ends `child` and every process it started. Quarto is a launcher that starts Deno, Typst and
/// Pandoc, so ending it alone leaves them running, with the output pipes open.
fn kill_tree(child: &mut Child) {
    #[cfg(unix)]
    // SAFETY: `kill` with a negative PID only signals the process group `run_limited` made.
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    #[cfg(windows)]
    let _ = command(Path::new("taskkill"), &["/PID", &child.id().to_string(), "/T", "/F"], None)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    let _ = child.kill();
    let _ = child.wait();
}

/// Runs `command` and waits at most `limit`, then ends it and everything it started. Its output
/// is read as it runs, so a program that writes a lot cannot stall.
fn run_limited(mut command: Command, limit: Duration) -> AppResult<Finished> {
    command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(unix)]
    {
        // Its own process group, so that the whole tree can be ended at once.
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|e| AppError::new(NOT_STARTED, format!("Quarto could not be started: {e}")))?;
    let out = child.stdout.take().map(drain);
    let err = child.stderr.take().map(drain);
    let started = Instant::now();
    let success = loop {
        match child.try_wait()? {
            Some(status) => break status.success(),
            None if started.elapsed() >= limit => {
                kill_tree(&mut child);
                // The pipes close with the processes, which ends the reader threads.
                return Err(AppError::new(
                    "render_timeout",
                    format!("Quarto took longer than {} seconds. Try again.", limit.as_secs()),
                ));
            }
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    };
    let mut output = String::new();
    for handle in [out, err].into_iter().flatten() {
        output.push_str(&String::from_utf8_lossy(&handle.join().unwrap_or_default()));
    }
    Ok(Finished { success, output })
}

/// The last lines of Quarto's output with its colour codes removed: where it says what failed.
fn last_lines(output: &str, count: usize) -> String {
    let mut plain = String::new();
    let mut chars = output.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' && chars.peek() == Some(&'[') {
            for next in chars.by_ref() {
                if next.is_ascii_alphabetic() {
                    break;
                }
            }
        } else {
            plain.push(c);
        }
    }
    let lines: Vec<&str> = plain.lines().map(str::trim_end).filter(|l| !l.is_empty()).collect();
    lines[lines.len().saturating_sub(count)..].join("\n")
}

/// A render's temporary folder inside the Project, removed when this is dropped.
struct RenderFolder {
    path: PathBuf,
    /// Project files copied in, as opposed to what Quarto made.
    copied: Vec<String>,
}

impl RenderFolder {
    fn create(project: &Project) -> AppResult<Self> {
        let path = project.paths.resolve(&format!("render/{}", new_id()))?;
        std::fs::create_dir_all(&path)?;
        Ok(Self { path, copied: Vec::new() })
    }
}

/// Removes render folders an earlier run left, as after a crash; one that cannot be removed is left
/// for the next run. Only while no render runs: a Project opens once per run, before any render.
pub fn remove_stale_renders(project: &Project) {
    if let Ok(folder) = project.paths.resolve("render") {
        let _ = std::fs::remove_dir_all(folder);
    }
}

impl Drop for RenderFolder {
    fn drop(&mut self) {
        // The shared `render/` folder stays: removing it could break a render that is just
        // creating its own folder inside it.
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

/// The header of `source`, between its opening and closing `---` lines.
fn front_matter(source: &str) -> Option<&str> {
    let rest = source.strip_prefix("---\n").or_else(|| source.strip_prefix("---\r\n"))?;
    let end = rest.find("\n---")?;
    Some(&rest[..end])
}

/// Refuses a source that makes Quarto read files outside the render folder or run code despite
/// `--no-execute`: an escaping path, file or environment shortcodes, filter or include keys.
fn check_source(source: &str) -> AppResult<()> {
    let refuse = |what: String| {
        Err(AppError::new(
            "document_refused",
            format!("Quarto is not run on this document: {what}. Remove it and try again."),
        ))
    };
    if source.contains("../") || source.contains("..\\") {
        return refuse("it refers to a file outside its own folder (`../`)".into());
    }
    let mut rest = source;
    while let Some(start) = rest.find("{{<") {
        let after = &rest[start + 3..];
        let name: String = after
            .trim_start()
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '-')
            .collect();
        if REFUSED_SHORTCODES.contains(&name.as_str()) {
            return refuse(format!("its `{{{{< {name} >}}}}` shortcode reads files or the environment"));
        }
        rest = after;
    }
    for line in front_matter(source).unwrap_or("").lines() {
        let key = line.split(':').next().unwrap_or("").trim();
        if REFUSED_KEYS.contains(&key) {
            return refuse(format!("its header sets `{key}`, which runs filters or inserts files"));
        }
    }
    Ok(())
}

/// The files a render makes, files that change how Quarto renders (`_quarto.yml`, `_metadata.yml`,
/// `_extensions`), Lua filters, and the preview's page images.
fn is_reserved(name: &str) -> bool {
    RESERVED.contains(&name)
        || name.starts_with('_')
        || name.to_lowercase().ends_with(".lua")
        || page_number(name).is_some()
}

/// The assets whose names appear in `source`, which a document refers to as files.
fn named_assets(source: &str, assets: Vec<AssetRef>) -> Vec<AssetRef> {
    assets
        .into_iter()
        .filter(|a| !a.name.is_empty() && !is_reserved(&a.name))
        .filter(|a| source.contains(&a.name))
        .collect()
}

/// Writes `source` as `document.qmd` in a new render folder with the Project files it names.
fn prepare(project: &Project, source: &str) -> AppResult<RenderFolder> {
    check_source(source)?;
    let mut folder = RenderFolder::create(project)?;
    std::fs::write(folder.path.join("document.qmd"), source)?;
    for asset in named_assets(source, assets::list(project, None)?) {
        let from = assets::file_path(project, asset.id)?;
        std::fs::copy(from, folder.path.join(&asset.name))?;
        folder.copied.push(asset.name);
    }
    Ok(folder)
}

/// The `ext` file Quarto made in `folder`: `document.<ext>` or the name the document's
/// `output-file` gave it, never a file copied from the Project.
fn output_file(folder: &RenderFolder, ext: &str) -> AppResult<PathBuf> {
    let expected = folder.path.join(format!("document.{ext}"));
    if expected.is_file() {
        return Ok(expected);
    }
    for entry in std::fs::read_dir(&folder.path)? {
        let path = entry?.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        let right_kind = path.extension().is_some_and(|e| e == ext);
        if right_kind && path.is_file() && !folder.copied.contains(&name) {
            return Ok(path);
        }
    }
    Err(AppError::new("quarto_failed", format!("Quarto made no .{ext} file for this document.")))
}

/// Renders `document.qmd` to Typst without running code. `metadata` is one `key:value` option:
/// `keep-typ:true` makes the PDF and keeps the Typst, `output-ext:typ` stops at the Typst.
fn render(quarto: &Path, folder: &Path, metadata: &str) -> AppResult<()> {
    let args = ["render", "document.qmd", "--to", "typst", "--no-execute", "-M", metadata];
    let finished = run_limited(command(quarto, &args, Some(folder)), RENDER_LIMIT)?;
    if finished.success {
        return Ok(());
    }
    Err(AppError::new("quarto_failed", last_lines(&finished.output, 12)))
}

/// The document `source` rendered by `quarto` as PDF bytes.
pub fn export_pdf(project: &Project, quarto: &Path, source: &str) -> AppResult<Vec<u8>> {
    let folder = prepare(project, source)?;
    render(quarto, &folder.path, "keep-typ:true")?;
    Ok(std::fs::read(output_file(&folder, "pdf")?)?)
}

/// The document `source` rendered by `quarto` as SVG images, one per page.
pub fn preview_pages(project: &Project, quarto: &Path, source: &str) -> AppResult<Vec<String>> {
    let folder = prepare(project, source)?;
    render(quarto, &folder.path, "output-ext:typ")?;
    let typ = output_file(&folder, "typ")?;
    let typ_name = typ.file_name().and_then(|n| n.to_str()).unwrap_or("document.typ");
    let args = ["typst", "compile", "--format", "svg", typ_name, "page-{p}.svg"];
    let finished = run_limited(command(quarto, &args, Some(&folder.path)), PAGES_LIMIT)?;
    if !finished.success {
        return Err(AppError::new("quarto_failed", last_lines(&finished.output, 12)));
    }
    let mut pages = Vec::new();
    for entry in std::fs::read_dir(&folder.path)? {
        let name = entry?.file_name().to_string_lossy().into_owned();
        if let Some(number) = page_number(&name) {
            pages.push((number, name));
        }
    }
    pages.sort();
    pages
        .into_iter()
        .map(|(_, name)| Ok(std::fs::read_to_string(folder.path.join(name))?))
        .collect()
}

/// The page number in a name like `page-12.svg`.
fn page_number(name: &str) -> Option<u32> {
    name.strip_prefix("page-")?.strip_suffix(".svg")?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::test_support::temp_project;

    #[test]
    fn the_version_is_read_from_quartos_output() {
        assert_eq!(parse_version("1.10.18\n"), Some((1, 10, 18)));
        assert_eq!(parse_version("1.9.9"), Some((1, 9, 9)));
        assert_eq!(parse_version("quarto not found"), None);
        assert_eq!(parse_version(""), None);
    }

    #[test]
    fn quarto_is_found_in_the_setting_then_the_path_then_the_install_folders() {
        let on_path = tempfile::tempdir().unwrap();
        let installed = tempfile::tempdir().unwrap();
        let path_program = on_path.path().join(NAMES[0]);
        let folder_program = installed.path().join(NAMES[0]);
        std::fs::write(&path_program, "").unwrap();
        std::fs::write(&folder_program, "").unwrap();
        let var = Some(on_path.path().as_os_str());
        let folders = [folder_program.clone()];

        let chosen = locate(Some(" /chosen/quarto "), var, &folders);
        assert_eq!(chosen, Some(PathBuf::from("/chosen/quarto")));
        assert_eq!(locate(None, var, &folders), Some(path_program));
        assert_eq!(locate(Some(""), None, &folders), Some(folder_program));

        let empty = tempfile::tempdir().unwrap();
        let missing = empty.path().join(NAMES[0]);
        assert_eq!(locate(None, Some(empty.path().as_os_str()), &[missing]), None);
    }

    #[test]
    fn a_missing_or_too_old_quarto_blocks_and_says_why() {
        let missing = Status::new(State::Missing, None, None, false).blocking().unwrap();
        assert_eq!(missing.code, "quarto_missing");
        assert!(missing.message.contains(INSTALL_URL));
        let old = Status::new(State::TooOld, Some("1.9.9".into()), None, false).blocking().unwrap();
        assert!(old.message.contains("1.9.9") && old.message.contains("1.10"));
        assert!(Status::new(State::Found, Some("1.10.18".into()), None, false).blocking().is_none());
    }

    fn counted(count: &std::sync::Arc<std::sync::atomic::AtomicUsize>) -> Known {
        let count = std::sync::Arc::clone(count);
        let lookup = move |setting: Option<&str>| {
            count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            let path = setting.map(PathBuf::from);
            Status::new(State::Found, Some("1.10.18".into()), path.as_deref(), path.is_some())
        };
        Known::with_lookup(None, Box::new(lookup))
    }

    #[test]
    fn quarto_is_looked_up_once_until_it_is_asked_again() {
        let count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let known = counted(&count);
        known.status();
        known.status();
        known.require().unwrap();
        assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst), 1);
        known.refresh();
        assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst), 2);
    }

    #[test]
    fn changing_the_location_looks_again_with_the_new_one() {
        let count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let known = counted(&count);
        assert!(!known.status().chosen);
        let after = known.set_setting(Some("/chosen/quarto".into()));
        assert_eq!(after.path.as_deref(), Some("/chosen/quarto"));
        assert!(known.status().chosen);
        assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst), 2);
    }

    #[test]
    fn a_document_that_reads_files_or_runs_filters_is_refused() {
        let refused = [
            "text\n\n{{< include ../notes.qmd >}}\n",
            "{{<env HOME>}}",
            "{{< embed analysis.ipynb >}}",
            "see ../secret.txt",
            "---\ntitle: t\nfilters:\n  - a.lua\n---\n\ntext",
            "---\ntitle: t\nformat:\n  typst:\n    template: mine.typ\n---\n",
            "---\ntitle: t\ninclude-in-header: head.typ\n---\n",
        ];
        for source in refused {
            let error = check_source(source).unwrap_err();
            assert_eq!(error.code, "document_refused", "{source}");
        }
    }

    #[test]
    fn an_ordinary_document_is_not_refused() {
        let source = "---\ntitle: \"A\"\ndate: 2026-11-02\nformat:\n  typst:\n    toc: true\n---\n\n\
                      ## Intro\n\n![Sites](sites.png)\n\n{{< pagebreak >}}\n\n\
                      | a | b |\n|---|---|\n| 1 | 2 |\n\nPress {{< kbd Ctrl-C >}}.\n";
        check_source(source).unwrap();
    }

    #[test]
    fn files_that_change_how_quarto_renders_stay_out_of_a_render() {
        for name in ["_quarto.yml", "_metadata.yml", "page-1.svg", "Filter.LUA", "document.pdf"] {
            assert!(is_reserved(name), "{name}");
        }
        assert!(!is_reserved("sites.png") && !is_reserved("field-trial.csv"));
    }

    #[test]
    fn the_output_is_found_under_the_name_the_document_gave_it() {
        let (_dir, project) = temp_project();
        let mut folder = RenderFolder::create(&project).unwrap();
        std::fs::write(folder.path.join("data.pdf"), "copied").unwrap();
        folder.copied.push("data.pdf".into());
        assert!(output_file(&folder, "pdf").is_err());
        std::fs::write(folder.path.join("report.pdf"), "made").unwrap();
        assert_eq!(output_file(&folder, "pdf").unwrap(), folder.path.join("report.pdf"));
        std::fs::write(folder.path.join("document.pdf"), "made").unwrap();
        assert_eq!(output_file(&folder, "pdf").unwrap(), folder.path.join("document.pdf"));
    }

    #[test]
    fn quartos_colour_codes_are_removed_from_its_error() {
        let output = "start\n\u{1b}[31mERROR\u{1b}[39m: Invalid YAML\n\n  at line 3\n";
        assert_eq!(last_lines(output, 2), "ERROR: Invalid YAML\n  at line 3");
        assert_eq!(last_lines(output, 10), "start\nERROR: Invalid YAML\n  at line 3");
    }

    #[test]
    fn pages_are_ordered_by_number_not_by_name() {
        assert_eq!(page_number("page-2.svg"), Some(2));
        assert_eq!(page_number("page-10.svg"), Some(10));
        assert_eq!(page_number("document.typ"), None);
    }

    #[test]
    fn a_render_folder_is_removed_when_it_is_dropped() {
        let (_dir, project) = temp_project();
        let folder = RenderFolder::create(&project).unwrap();
        let path = folder.path.clone();
        assert!(path.is_dir());
        drop(folder);
        assert!(!path.exists());
    }

    /// Renders with the Quarto on this machine, so it does nothing where there is none.
    #[test]
    fn renders_with_the_users_quarto_when_it_is_installed() {
        let found = status(None);
        if found.state != State::Found {
            return;
        }
        let program = PathBuf::from(found.path.unwrap());
        let (dir, project) = temp_project();
        let marker = dir.path().join("ran.txt");
        let source = format!(
            "---\ntitle: \"Demo\"\ndate: 2026-11-02\nformat:\n  typst:\n    toc: true\n---\n\n\
             ## Intro\n\nText.[^1]\n\n[^1]: A note.\n\n```{{python}}\n\
             open({:?}, 'w').write('x')\n```\n",
            marker.display().to_string()
        );
        let pdf = export_pdf(&project, &program, &source).unwrap();
        assert!(pdf.starts_with(b"%PDF"));
        let pages = preview_pages(&project, &program, &source).unwrap();
        assert!(!pages.is_empty() && pages[0].contains("<svg"));
        assert!(!marker.exists(), "a code cell ran");
        let leftovers = std::fs::read_dir(project.paths.resolve("render").unwrap());
        assert!(leftovers.is_ok_and(|mut entries| entries.next().is_none()));

        // A document that names its own output file still exports and previews.
        let named = "---\ntitle: \"A\"\nformat:\n  typst:\n    output-file: report\n---\n\nText\n";
        assert!(export_pdf(&project, &program, named).unwrap().starts_with(b"%PDF"));
        assert!(!preview_pages(&project, &program, named).unwrap().is_empty());

        // A render that fails reports Quarto's own message.
        let broken = "---\ntitle: [unclosed\n---\n\nText\n";
        let error = export_pdf(&project, &program, broken).unwrap_err();
        assert_eq!(error.code, "quarto_failed");
        assert!(!error.message.trim().is_empty());
    }

    #[test]
    fn render_folders_from_an_earlier_run_are_removed() {
        let (_dir, project) = temp_project();
        let stale = project.paths.resolve("render/old").unwrap();
        std::fs::create_dir_all(&stale).unwrap();
        std::fs::write(stale.join("document.typ"), "x").unwrap();
        remove_stale_renders(&project);
        assert!(!project.paths.resolve("render").unwrap().exists());
        remove_stale_renders(&project);
    }

    /// A program that starts another and waits, like Quarto starting Typst: on a timeout both end.
    #[cfg(unix)]
    #[test]
    fn a_timeout_ends_the_programs_a_program_started() {
        let dir = tempfile::tempdir().unwrap();
        let pid_file = dir.path().join("child.pid");
        let script = format!("sleep 60 & echo $! > {}; wait", pid_file.display());
        let started = command(Path::new("sh"), &["-c", &script], None);
        let error = run_limited(started, Duration::from_millis(500)).err().unwrap();
        assert_eq!(error.code, "render_timeout");

        let child: i32 = std::fs::read_to_string(&pid_file).unwrap().trim().parse().unwrap();
        // A killed process stays in the table until init collects it.
        let ended = (0..100).any(|_| {
            std::thread::sleep(Duration::from_millis(20));
            // SAFETY: signal 0 only checks whether the process exists.
            unsafe { libc::kill(child, 0) == -1 }
        });
        assert!(ended, "the started program is still running");
    }

    #[test]
    fn preparing_a_render_writes_the_source_and_the_named_files() {
        let (_dir, project) = temp_project();
        let user = crate::projects::test_support::user();
        assets::import_bytes(&project, "sites.png", "image/png", b"png", &user).unwrap();
        assets::import_bytes(&project, "other.csv", "text/csv", b"a", &user).unwrap();
        let folder = prepare(&project, "![sites](sites.png)").unwrap();
        assert_eq!(
            std::fs::read_to_string(folder.path.join("document.qmd")).unwrap(),
            "![sites](sites.png)"
        );
        assert!(folder.path.join("sites.png").is_file());
        assert!(!folder.path.join("other.csv").exists());
    }
}
