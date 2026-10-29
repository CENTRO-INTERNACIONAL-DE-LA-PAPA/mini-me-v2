//! The sidecar process: launching it, the version handshake, the responsiveness check,
//! restarts with backoff, the status shown to the user, and the sidecar log.

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::link::{self, AdapterInfo, CoreFrame, SIDECAR_PROTOCOL, SidecarFrame};
use crate::protocol::now_ms;
use crate::runs::{FrameSink, Runs};

/// Delays before restarting after the 1st, 2nd, 3rd and 4th consecutive failure. The 5th
/// consecutive failure stops the retries.
pub const RESTART_DELAYS: [Duration; 4] = [
    Duration::from_millis(500),
    Duration::from_secs(1),
    Duration::from_secs(2),
    Duration::from_secs(4),
];

/// A sidecar that stays ready this long resets the count of consecutive failures.
pub const STABLE_AFTER: Duration = Duration::from_secs(60);

const SHUTDOWN_GRACE: Duration = Duration::from_secs(2);
const LOG_MAX_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Debug, Clone, Copy)]
pub struct Timing {
    pub start_timeout: Duration,
    pub ping_interval: Duration,
    pub ping_timeout: Duration,
}

impl Timing {
    /// A first `uv run` in development may need to create the environment, so it gets
    /// longer to start.
    pub fn for_build() -> Self {
        Self {
            start_timeout: if cfg!(debug_assertions) {
                Duration::from_secs(120)
            } else {
                Duration::from_secs(20)
            },
            ping_interval: Duration::from_secs(10),
            ping_timeout: Duration::from_secs(20),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SidecarState {
    Starting,
    Ready,
    Restarting,
    Stopped,
    Incompatible,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SidecarStatus {
    pub state: SidecarState,
    pub detail: Option<String>,
    pub protocol: Option<u32>,
    pub sidecar_version: Option<String>,
}

impl SidecarStatus {
    fn new(state: SidecarState, detail: Option<&str>) -> Self {
        Self {
            state,
            detail: detail.map(str::to_string),
            protocol: None,
            sidecar_version: None,
        }
    }
}

/// How to start the sidecar process.
#[derive(Debug, Clone)]
pub enum Launch {
    /// `uv run` on the repository's `sidecar/` project.
    Dev { project_dir: PathBuf },
    /// The standalone Python and packages bundled under the app's resources.
    Release { sidecar_dir: PathBuf },
}

impl Launch {
    pub fn dev() -> Self {
        Launch::Dev {
            project_dir: Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("sidecar"),
        }
    }

    pub fn release(resource_dir: &Path) -> Self {
        Launch::Release {
            sidecar_dir: resource_dir.join("sidecar"),
        }
    }

    /// `-I` keeps the user's `PYTHON*` variables and user site-packages out; `-X utf8` makes
    /// stderr UTF-8 whatever the system code page.
    pub fn command(&self, test_adapters: bool) -> Command {
        let mut command = match self {
            Launch::Dev { project_dir } => {
                let mut command = Command::new("uv");
                command
                    .arg("run")
                    .arg("--frozen")
                    .arg("--project")
                    .arg(project_dir)
                    .args(["python", "-I", "-X", "utf8", "-m", "mini_me_sidecar"]);
                command
            }
            Launch::Release { sidecar_dir } => {
                let python = if cfg!(windows) {
                    sidecar_dir.join("python").join("python.exe")
                } else {
                    sidecar_dir.join("python").join("bin").join("python3")
                };
                let mut command = Command::new(python);
                command
                    .args(["-I", "-X", "utf8"])
                    .arg(sidecar_dir.join("launch.py"));
                command
            }
        };
        if test_adapters {
            command.arg("--test-adapters");
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        command
    }
}

/// The sidecar log in the app's log directory, rotated once at a size limit. Never inside
/// the Mini-Me Data folder.
pub struct SidecarLog {
    path: Option<PathBuf>,
    max_bytes: u64,
    lock: Mutex<()>,
}

impl SidecarLog {
    pub fn new(dir: &Path) -> Self {
        Self::with_limit(dir, LOG_MAX_BYTES)
    }

    fn with_limit(dir: &Path, max_bytes: u64) -> Self {
        let path = std::fs::create_dir_all(dir)
            .ok()
            .map(|_| dir.join("sidecar.log"));
        Self {
            path,
            max_bytes,
            lock: Mutex::new(()),
        }
    }

    #[cfg(test)]
    pub fn disabled() -> Self {
        Self {
            path: None,
            max_bytes: 0,
            lock: Mutex::new(()),
        }
    }

    pub fn line(&self, text: &str) {
        if cfg!(debug_assertions) {
            eprintln!("[sidecar] {text}");
        }
        let Some(path) = &self.path else {
            return;
        };
        let _guard = self.lock.lock().unwrap_or_else(|p| p.into_inner());
        if std::fs::metadata(path).is_ok_and(|m| m.len() >= self.max_bytes) {
            let previous = path.with_extension("log.1");
            let _ = std::fs::remove_file(&previous);
            let _ = std::fs::rename(path, &previous);
        }
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{} {text}", now_ms());
        }
    }
}

/// Counts consecutive failures and decides how long to wait before the next start.
#[derive(Debug, Default)]
pub struct Backoff {
    failures: usize,
    ready_since: Option<Instant>,
}

impl Backoff {
    pub fn ready(&mut self, now: Instant) {
        self.ready_since = Some(now);
    }

    /// Records a failure at `now`; returns the delay before the next start, or `None` when
    /// it is time to stop retrying.
    pub fn failed(&mut self, now: Instant) -> Option<Duration> {
        if let Some(since) = self.ready_since.take() {
            if now.duration_since(since) >= STABLE_AFTER {
                self.failures = 0;
            }
        }
        self.failures += 1;
        RESTART_DELAYS.get(self.failures - 1).copied()
    }

    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

/// Checks the sidecar's protocol version; on a mismatch, the text shown to the user. Protocol
/// versions only increase, so in development the lower side is the stale one.
pub fn check_protocol(theirs: u32, ours: u32, dev: bool) -> Result<(), String> {
    if theirs == ours {
        return Ok(());
    }
    let mut detail = format!(
        "Mini-Me's runtime uses protocol version {theirs}, but this app needs version {ours}. \
         Reinstall Mini-Me to fix this."
    );
    if dev {
        detail.push_str(if theirs < ours {
            " In development: the sidecar is the stale side; update sidecar/."
        } else {
            " In development: the Rust core is the stale side; rebuild it."
        });
    }
    Err(detail)
}

pub enum Incoming {
    Line(String),
    Closed,
}

#[derive(Debug, PartialEq)]
pub enum HandshakeError {
    Timeout,
    Closed,
    Incompatible(String),
}

pub struct Handshake {
    pub protocol: u32,
    pub sidecar_version: String,
    pub adapters: Vec<AdapterInfo>,
}

/// Waits for `hello`, checks the protocol version, then lists the adapters. Frames other than
/// the ones expected are logged and skipped.
pub fn handshake(
    rx: &Receiver<Incoming>,
    sink: &dyn FrameSink,
    deadline: Instant,
    dev: bool,
    log: &SidecarLog,
) -> Result<Handshake, HandshakeError> {
    let next = |log: &SidecarLog| -> Result<SidecarFrame, HandshakeError> {
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            match rx.recv_timeout(left) {
                Ok(Incoming::Line(line)) => match link::parse_line(&line) {
                    Some(frame) => return Ok(frame),
                    None => log.line(&format!("ignoring unreadable line: {line}")),
                },
                Ok(Incoming::Closed) | Err(RecvTimeoutError::Disconnected) => {
                    return Err(HandshakeError::Closed);
                }
                Err(RecvTimeoutError::Timeout) => return Err(HandshakeError::Timeout),
            }
        }
    };

    let (protocol, sidecar_version) = loop {
        match next(log)? {
            SidecarFrame::Hello {
                protocol,
                sidecar_version,
                python_version,
            } => {
                log.line(&format!(
                    "hello: protocol {protocol}, sidecar {sidecar_version}, Python {python_version}"
                ));
                break (protocol, sidecar_version);
            }
            other => log.line(&format!("ignoring {other:?} before hello")),
        }
    };
    check_protocol(protocol, SIDECAR_PROTOCOL, dev).map_err(HandshakeError::Incompatible)?;

    sink.send(&CoreFrame::AdaptersList {});
    loop {
        match next(log)? {
            SidecarFrame::Adapters { adapters } => {
                return Ok(Handshake {
                    protocol,
                    sidecar_version,
                    adapters,
                });
            }
            other => log.line(&format!("ignoring {other:?} while listing adapters")),
        }
    }
}

/// Writes frames to the sidecar's stdin, one line each, flushed at once.
struct ChildSink {
    stdin: Mutex<ChildStdin>,
    log: Arc<SidecarLog>,
    log_frames: bool,
}

impl FrameSink for ChildSink {
    fn send(&self, frame: &CoreFrame) -> bool {
        if self.log_frames {
            self.log.line(&format!("-> {}", link::redacted(frame)));
        }
        let mut stdin = self.stdin.lock().unwrap_or_else(|p| p.into_inner());
        stdin
            .write_all(link::encode(frame).as_bytes())
            .and_then(|_| stdin.flush())
            .is_ok()
    }
}

enum Outcome {
    Shutdown,
    Failed(String),
    Incompatible(String),
}

type StatusSink = Box<dyn Fn(&SidecarStatus) -> bool + Send>;

#[derive(Default)]
struct Control {
    restart_requested: bool,
    shutting_down: bool,
    child: Option<Arc<Mutex<Child>>>,
    sink: Option<Arc<ChildSink>>,
}

pub struct Supervisor {
    launch: Launch,
    test_adapters: bool,
    timing: Timing,
    calls: Arc<Runs>,
    log: Arc<SidecarLog>,
    status: Mutex<SidecarStatus>,
    subscribers: Mutex<Vec<StatusSink>>,
    control: Mutex<Control>,
    wake: Condvar,
}

impl Supervisor {
    pub fn new(
        launch: Launch,
        test_adapters: bool,
        timing: Timing,
        calls: Arc<Runs>,
        log: Arc<SidecarLog>,
    ) -> Arc<Self> {
        Arc::new(Self {
            launch,
            test_adapters,
            timing,
            calls,
            log,
            status: Mutex::new(SidecarStatus::new(
                SidecarState::Starting,
                Some("Mini-Me is starting."),
            )),
            subscribers: Mutex::new(Vec::new()),
            control: Mutex::new(Control::default()),
            wake: Condvar::new(),
        })
    }

    /// Starts supervising on a background thread.
    pub fn spawn(self: &Arc<Self>) {
        let this = Arc::clone(self);
        std::thread::spawn(move || this.run());
    }

    pub fn status(&self) -> SidecarStatus {
        self.status.lock().unwrap_or_else(|p| p.into_inner()).clone()
    }

    /// Sends the current status to `sink` and then every change. `sink` returns `false`
    /// when it is gone.
    pub fn subscribe(&self, sink: StatusSink) {
        let status = self.status.lock().unwrap_or_else(|p| p.into_inner());
        if sink(&*status) {
            self.subscribers
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .push(sink);
        }
    }

    /// Starts the sidecar again after it was `stopped` or `incompatible`.
    pub fn restart(&self) {
        let state = self.status().state;
        if matches!(state, SidecarState::Stopped | SidecarState::Incompatible) {
            self.control().restart_requested = true;
            self.wake.notify_all();
        }
    }

    /// Asks the sidecar to exit and stops it if it has not within the grace period.
    pub fn shutdown(&self) {
        let (child, sink) = {
            let mut control = self.control();
            control.shutting_down = true;
            (control.child.clone(), control.sink.clone())
        };
        self.wake.notify_all();
        if let Some(sink) = sink {
            sink.send(&CoreFrame::Shutdown {});
        }
        if let Some(child) = child {
            let deadline = Instant::now() + SHUTDOWN_GRACE;
            loop {
                let mut child = child.lock().unwrap_or_else(|p| p.into_inner());
                if !matches!(child.try_wait(), Ok(None)) {
                    break;
                }
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
                drop(child);
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    }

    fn control(&self) -> MutexGuard<'_, Control> {
        self.control.lock().unwrap_or_else(|p| p.into_inner())
    }

    fn set_status(&self, status: SidecarStatus) {
        let mut current = self.status.lock().unwrap_or_else(|p| p.into_inner());
        if *current == status {
            return;
        }
        *current = status;
        self.subscribers
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .retain(|sink| sink(&*current));
    }

    /// Waits until a restart is requested; `false` when the app is shutting down instead.
    fn wait_for_restart(&self) -> bool {
        let mut control = self.control();
        while !control.restart_requested && !control.shutting_down {
            control = self.wake.wait(control).unwrap_or_else(|p| p.into_inner());
        }
        control.restart_requested = false;
        !control.shutting_down
    }

    /// Sleeps for `delay`; `false` when the app started shutting down meanwhile.
    fn pause(&self, delay: Duration) -> bool {
        let deadline = Instant::now() + delay;
        let mut control = self.control();
        while !control.shutting_down {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return true;
            }
            control = self
                .wake
                .wait_timeout(control, left)
                .unwrap_or_else(|p| p.into_inner())
                .0;
        }
        false
    }

    fn run(self: Arc<Self>) {
        let mut backoff = Backoff::default();
        let mut state = SidecarState::Starting;
        loop {
            let detail = if state == SidecarState::Starting {
                "Mini-Me is starting."
            } else {
                "Mini-Me is restarting."
            };
            self.set_status(SidecarStatus::new(state, Some(detail)));
            let outcome = self.run_once(&mut backoff);
            self.calls.disconnect();
            {
                let mut control = self.control();
                control.child = None;
                control.sink = None;
                if control.shutting_down {
                    return;
                }
            }
            match outcome {
                Outcome::Shutdown => return,
                Outcome::Incompatible(detail) => {
                    self.log.line(&detail);
                    self.set_status(SidecarStatus::new(SidecarState::Incompatible, Some(&detail)));
                    if !self.wait_for_restart() {
                        return;
                    }
                    backoff.reset();
                    state = SidecarState::Starting;
                }
                Outcome::Failed(reason) => {
                    self.log.line(&format!("sidecar failed: {reason}"));
                    match backoff.failed(Instant::now()) {
                        Some(delay) => {
                            self.set_status(SidecarStatus::new(
                                SidecarState::Restarting,
                                Some("Mini-Me is restarting."),
                            ));
                            if !self.pause(delay) {
                                return;
                            }
                            state = SidecarState::Restarting;
                        }
                        None => {
                            self.set_status(SidecarStatus::new(
                                SidecarState::Stopped,
                                Some(
                                    "Mini-Me's runtime could not be started. Try again, or \
                                     check the sidecar log.",
                                ),
                            ));
                            if !self.wait_for_restart() {
                                return;
                            }
                            backoff.reset();
                            state = SidecarState::Starting;
                        }
                    }
                }
            }
        }
    }

    fn run_once(&self, backoff: &mut Backoff) -> Outcome {
        let mut child = match self.launch.command(self.test_adapters).spawn() {
            Ok(child) => child,
            Err(err) => return Outcome::Failed(format!("could not start the process: {err}")),
        };
        let (Some(stdin), Some(stdout), Some(stderr)) =
            (child.stdin.take(), child.stdout.take(), child.stderr.take())
        else {
            let _ = child.kill();
            return Outcome::Failed("the process has no standard streams".into());
        };
        let child = Arc::new(Mutex::new(child));

        let (tx, rx) = std::sync::mpsc::channel();
        spawn_reader(stdout, tx);
        let log = Arc::clone(&self.log);
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines() {
                match line {
                    Ok(line) => log.line(&format!("stderr: {line}")),
                    Err(_) => break,
                }
            }
        });

        let sink = Arc::new(ChildSink {
            stdin: Mutex::new(stdin),
            log: Arc::clone(&self.log),
            log_frames: std::env::var("MINI_ME_LOG_FRAMES").as_deref() == Ok("1"),
        });
        {
            let mut control = self.control();
            if control.shutting_down {
                kill(&child);
                return Outcome::Shutdown;
            }
            control.child = Some(Arc::clone(&child));
            control.sink = Some(Arc::clone(&sink));
        }

        let deadline = Instant::now() + self.timing.start_timeout;
        let ready = match handshake(&rx, &*sink, deadline, cfg!(debug_assertions), &self.log) {
            Ok(ready) => ready,
            Err(HandshakeError::Timeout) => {
                kill(&child);
                return Outcome::Failed(format!(
                    "no hello within {} seconds",
                    self.timing.start_timeout.as_secs()
                ));
            }
            Err(HandshakeError::Closed) => {
                return Outcome::Failed(format!("stopped before it was ready ({})", exit(&child)));
            }
            Err(HandshakeError::Incompatible(detail)) => {
                kill(&child);
                return Outcome::Incompatible(detail);
            }
        };

        self.calls
            .connect(Arc::clone(&sink) as Arc<dyn FrameSink>, ready.adapters);
        backoff.ready(Instant::now());
        self.set_status(SidecarStatus {
            state: SidecarState::Ready,
            detail: None,
            protocol: Some(ready.protocol),
            sidecar_version: Some(ready.sidecar_version),
        });
        self.serve(&rx, &*sink, &child)
    }

    /// Routes frames to the runs and checks the sidecar answers `ping` in time.
    fn serve(&self, rx: &Receiver<Incoming>, sink: &dyn FrameSink, child: &Arc<Mutex<Child>>) -> Outcome {
        let mut next_ping = Instant::now() + self.timing.ping_interval;
        let mut awaiting: Option<(String, Instant)> = None;
        let mut nonce: u64 = 0;
        loop {
            let wake_at = awaiting
                .as_ref()
                .map_or(next_ping, |(_, deadline)| next_ping.min(*deadline));
            match rx.recv_timeout(wake_at.saturating_duration_since(Instant::now())) {
                Ok(Incoming::Line(line)) => match link::parse_line(&line) {
                    Some(SidecarFrame::Pong { nonce }) => {
                        if awaiting.as_ref().is_some_and(|(expected, _)| *expected == nonce) {
                            awaiting = None;
                        }
                    }
                    Some(SidecarFrame::Unknown) => {
                        self.log.line(&format!("ignoring unknown frame: {line}"));
                    }
                    Some(frame @ (SidecarFrame::Hello { .. } | SidecarFrame::Adapters { .. })) => {
                        self.log.line(&format!("ignoring unexpected {frame:?}"));
                    }
                    Some(frame) => self.calls.handle(frame),
                    None => self.log.line(&format!("ignoring unreadable line: {line}")),
                },
                Ok(Incoming::Closed) | Err(RecvTimeoutError::Disconnected) => {
                    if self.control().shutting_down {
                        return Outcome::Shutdown;
                    }
                    return Outcome::Failed(format!("the process stopped ({})", exit(child)));
                }
                Err(RecvTimeoutError::Timeout) => {
                    let now = Instant::now();
                    if awaiting.as_ref().is_some_and(|(_, deadline)| now >= *deadline) {
                        kill(child);
                        return Outcome::Failed("the process stopped answering".into());
                    }
                    if now >= next_ping {
                        nonce += 1;
                        sink.send(&CoreFrame::Ping {
                            nonce: nonce.to_string(),
                        });
                        if awaiting.is_none() {
                            awaiting = Some((nonce.to_string(), now + self.timing.ping_timeout));
                        }
                        next_ping = now + self.timing.ping_interval;
                    }
                }
            }
        }
    }
}

/// Forwards each stdout line to `tx`, then `Closed` at end of stream. Invalid UTF-8 is kept
/// lossily so the line can still be logged.
fn spawn_reader(stdout: impl std::io::Read + Send + 'static, tx: Sender<Incoming>) {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut buffer = Vec::new();
        loop {
            buffer.clear();
            match reader.read_until(b'\n', &mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let line = String::from_utf8_lossy(&buffer).into_owned();
                    if tx.send(Incoming::Line(line)).is_err() {
                        return;
                    }
                }
            }
        }
        let _ = tx.send(Incoming::Closed);
    });
}

fn kill(child: &Arc<Mutex<Child>>) {
    let mut child = child.lock().unwrap_or_else(|p| p.into_inner());
    let _ = child.kill();
    let _ = child.wait();
}

fn exit(child: &Arc<Mutex<Child>>) -> String {
    let mut child = child.lock().unwrap_or_else(|p| p.into_inner());
    match child.wait() {
        Ok(status) => status.to_string(),
        Err(err) => err.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn backoff_delays_then_gives_up_after_five_failures() {
        let mut backoff = Backoff::default();
        let now = Instant::now();
        let delays: Vec<_> = (0..5).map(|_| backoff.failed(now)).collect();
        assert_eq!(
            delays,
            vec![
                Some(Duration::from_millis(500)),
                Some(Duration::from_secs(1)),
                Some(Duration::from_secs(2)),
                Some(Duration::from_secs(4)),
                None,
            ]
        );
    }

    #[test]
    fn staying_ready_resets_the_failure_count() {
        let mut backoff = Backoff::default();
        let start = Instant::now();
        backoff.failed(start);
        backoff.failed(start);

        backoff.ready(start);
        assert_eq!(backoff.failed(start + Duration::from_secs(10)), Some(Duration::from_secs(2)));

        backoff.ready(start);
        assert_eq!(backoff.failed(start + STABLE_AFTER), Some(Duration::from_millis(500)));
    }

    #[test]
    fn protocol_mismatch_names_both_versions_and_the_stale_side() {
        assert_eq!(check_protocol(1, 1, true), Ok(()));

        let release = check_protocol(1, 2, false).unwrap_err();
        assert!(release.contains("version 1") && release.contains("version 2"));
        assert!(release.contains("Reinstall Mini-Me"));
        assert!(!release.contains("stale"));

        assert!(check_protocol(1, 2, true).unwrap_err().contains("the sidecar is the stale side"));
        assert!(check_protocol(3, 2, true).unwrap_err().contains("the Rust core is the stale side"));
    }

    #[derive(Default)]
    struct Recorder(Mutex<Vec<CoreFrame>>);

    impl FrameSink for Recorder {
        fn send(&self, frame: &CoreFrame) -> bool {
            self.0.lock().unwrap().push(frame.clone());
            true
        }
    }

    fn line(value: serde_json::Value) -> Incoming {
        Incoming::Line(format!("{value}\n"))
    }

    fn hello(protocol: u32) -> Incoming {
        line(json!({ "type": "hello", "protocol": protocol, "sidecar_version": "0.1.0", "python_version": "3.14.0" }))
    }

    fn soon() -> Instant {
        Instant::now() + Duration::from_secs(5)
    }

    #[test]
    fn handshake_lists_adapters_after_a_matching_hello() {
        let (tx, rx) = std::sync::mpsc::channel();
        tx.send(Incoming::Line("garbage\n".into())).unwrap();
        tx.send(hello(SIDECAR_PROTOCOL)).unwrap();
        tx.send(line(json!({ "type": "adapters", "adapters": [{
            "id": "echo", "description": "", "input_schema": {}, "providers": []
        }] })))
        .unwrap();
        let sink = Recorder::default();
        let ready = handshake(&rx, &sink, soon(), false, &SidecarLog::disabled()).unwrap();
        assert_eq!(ready.adapters[0].id, "echo");
        assert_eq!(*sink.0.lock().unwrap(), vec![CoreFrame::AdaptersList {}]);
    }

    #[test]
    fn handshake_refuses_a_mismatched_sidecar() {
        let (tx, rx) = std::sync::mpsc::channel();
        tx.send(hello(SIDECAR_PROTOCOL + 1)).unwrap();
        let sink = Recorder::default();
        let err = handshake(&rx, &sink, soon(), false, &SidecarLog::disabled())
            .err()
            .unwrap();
        assert!(matches!(err, HandshakeError::Incompatible(_)));
        assert!(sink.0.lock().unwrap().is_empty());
    }

    #[test]
    fn a_version_10_sidecar_is_refused_naming_both_versions() {
        assert_eq!(SIDECAR_PROTOCOL, 11);
        let (tx, rx) = std::sync::mpsc::channel();
        tx.send(hello(10)).unwrap();
        let err = handshake(&rx, &Recorder::default(), soon(), false, &SidecarLog::disabled())
            .err()
            .unwrap();
        let HandshakeError::Incompatible(detail) = err else {
            panic!("expected Incompatible, got {err:?}");
        };
        assert!(detail.contains("10") && detail.contains("11"), "{detail}");
    }

    #[test]
    fn handshake_times_out_or_sees_the_process_end() {
        let (_tx, rx) = std::sync::mpsc::channel::<Incoming>();
        let deadline = Instant::now() + Duration::from_millis(50);
        let err = handshake(&rx, &Recorder::default(), deadline, false, &SidecarLog::disabled());
        assert_eq!(err.err(), Some(HandshakeError::Timeout));

        let (tx, rx) = std::sync::mpsc::channel();
        tx.send(Incoming::Closed).unwrap();
        let err = handshake(&rx, &Recorder::default(), soon(), false, &SidecarLog::disabled());
        assert_eq!(err.err(), Some(HandshakeError::Closed));
    }

    /// A supervisor running the real sidecar from `sidecar/` with the test adapters, plus a
    /// Project to reply in. Needs `uv`; these tests are `#[ignore]`d for that reason.
    struct Real {
        _dir: tempfile::TempDir,
        project: Arc<crate::store::Project>,
        calls: Arc<Runs>,
        supervisor: Arc<Supervisor>,
    }

    impl Drop for Real {
        fn drop(&mut self) {
            self.supervisor.shutdown();
        }
    }

    fn wait_for(what: &str, timeout: Duration, mut done: impl FnMut() -> bool) {
        let deadline = Instant::now() + timeout;
        while !done() {
            assert!(Instant::now() < deadline, "timed out waiting for {what}");
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    fn real() -> Real {
        let (dir, project) = crate::projects::test_support::temp_project();
        let log = Arc::new(SidecarLog::disabled());
        let calls = Arc::new(Runs::new(
            Box::new(crate::secrets::test_support::MemorySecrets::dummy()),
            Arc::clone(&log),
            crate::runs::CANCEL_TIMEOUT,
            crate::user_library::LibraryStore::builtin(),
        ));
        let timing = Timing {
            start_timeout: Duration::from_secs(120),
            ping_interval: Duration::from_millis(500),
            ping_timeout: Duration::from_secs(5),
        };
        let supervisor = Supervisor::new(Launch::dev(), true, timing, Arc::clone(&calls), log);
        supervisor.spawn();
        let real = Real {
            _dir: dir,
            project: Arc::new(project),
            calls,
            supervisor,
        };
        real.wait_ready();
        real
    }

    impl Real {
        fn wait_ready(&self) {
            wait_for("the sidecar to be ready", Duration::from_secs(120), || {
                self.supervisor.status().state == SidecarState::Ready
            });
        }

        /// Starts `adapter` in a new Conversation; returns the reply's ID.
        fn start(&self, adapter: &str, input: serde_json::Value) -> uuid::Uuid {
            use crate::conversations::{SendMessageInput, create, send_message};
            let conversation = create(&self.project).unwrap().id;
            let text = input["text"].as_str().unwrap_or("go").to_string();
            let message = send_message(
                &self.project,
                conversation,
                SendMessageInput {
                    content: text,
                    attachments: Vec::new(),
                    text_components: Vec::new(),
                },
                crate::protocol::new_id(),
            )
            .unwrap();
            self.calls
                .start(
                    Arc::clone(&self.project),
                    conversation,
                    &message,
                    crate::runs::test_support::spec(adapter, input),
                    crate::runs::test_support::dummy_model(),
                )
                .unwrap()
        }

        fn reply(&self, reply: uuid::Uuid) -> crate::protocol::Message {
            self.project.lock().load_message(reply).unwrap().unwrap().1
        }

        fn wait_ended(&self, reply: uuid::Uuid) -> crate::protocol::Message {
            use crate::protocol::MessageStatus;
            wait_for("the reply to end", Duration::from_secs(30), || {
                self.reply(reply).status != MessageStatus::Streaming
            });
            self.reply(reply)
        }

        fn events(&self, reply: uuid::Uuid) -> Vec<crate::protocol::EventKind> {
            let conversation = self.project.lock().load_message(reply).unwrap().unwrap().0;
            self.project
                .lock()
                .events_after(conversation, 0)
                .unwrap()
                .into_iter()
                .map(|e| e.kind)
                .collect()
        }
    }

    #[test]
    #[ignore = "starts the real sidecar through uv"]
    fn real_sidecar_streams_echo() {
        use crate::protocol::MessageStatus;
        let real = real();
        let reply = real.start("echo", json!({ "text": "late blight spreads" }));
        let message = real.wait_ended(reply);
        assert_eq!(message.status, MessageStatus::Complete);
        assert_eq!(message.content, "late blight spreads");
        assert_eq!(message.author.id, "echo");
    }

    #[test]
    #[ignore = "starts the real sidecar through uv"]
    fn real_sidecar_cancels_echo() {
        use crate::protocol::{EventKind, MessageStatus};
        let real = real();
        let text = "one two three four five six seven eight nine ten eleven twelve";
        let reply = real.start("echo", json!({ "text": text }));
        std::thread::sleep(Duration::from_millis(250));
        let conversation = real.project.lock().load_message(reply).unwrap().unwrap().0;
        for id in crate::conversations::stop_reply(&real.project, conversation).unwrap() {
            real.calls.cancel_message(id);
        }
        std::thread::sleep(Duration::from_secs(1));
        let message = real.reply(reply);
        assert_eq!(message.status, MessageStatus::Cancelled);
        assert_ne!(message.content, text);
        let events = real.events(reply);
        let cancelled = events
            .iter()
            .position(|e| matches!(e, EventKind::MessageCancelled { .. }))
            .unwrap();
        assert_eq!(cancelled, events.len() - 1);
    }

    #[test]
    #[ignore = "starts the real sidecar through uv"]
    fn real_sidecar_isolates_a_failing_trait() {
        use crate::protocol::MessageStatus;
        let real = real();
        let echo = real.start("echo", json!({ "text": "a b c d e f g h i j k l m n o p" }));
        let failing = real.start("test-fail", json!({}));
        let message = real.wait_ended(failing);
        assert_eq!(message.status, MessageStatus::Failed);
        assert_eq!(real.reply(echo).status, MessageStatus::Streaming);
        assert_eq!(real.wait_ended(echo).status, MessageStatus::Complete);
        assert_eq!(real.supervisor.status().state, SidecarState::Ready);

        let unknown = real.start("no-such-adapter", json!({}));
        assert_eq!(real.wait_ended(unknown).status, MessageStatus::Failed);
    }

    #[test]
    #[ignore = "starts the real sidecar through uv"]
    fn real_sidecar_survives_a_trait_that_ignores_cancellation() {
        use crate::protocol::MessageStatus;
        let real = real();
        let stubborn = real.start("test-ignore-cancel", json!({}));
        std::thread::sleep(Duration::from_millis(300));
        let conversation = real.project.lock().load_message(stubborn).unwrap().unwrap().0;
        for id in crate::conversations::stop_reply(&real.project, conversation).unwrap() {
            real.calls.cancel_message(id);
        }
        std::thread::sleep(crate::runs::CANCEL_TIMEOUT + Duration::from_secs(1));
        assert_eq!(real.reply(stubborn).status, MessageStatus::Cancelled);
        assert_eq!(real.supervisor.status().state, SidecarState::Ready);
        let echo = real.start("echo", json!({ "text": "still here" }));
        assert_eq!(real.wait_ended(echo).content, "still here");
    }

    #[test]
    #[ignore = "starts the real sidecar through uv"]
    fn real_sidecar_keeps_the_dummy_secret_out_of_events() {
        let real = real();
        let reply = real.start("test-use-secret", json!({ "provider": "dummy" }));
        let message = real.wait_ended(reply);
        assert_eq!(message.content, "secret length 19");
        assert!(!format!("{:?}", real.events(reply)).contains("sk-dummy"));
    }

    #[test]
    #[ignore = "starts the real sidecar through uv"]
    fn real_sidecar_restarts_after_the_process_exits() {
        let real = real();
        let reply = real.start("test-exit", json!({}));
        let message = real.wait_ended(reply);
        assert_eq!(message.status, crate::protocol::MessageStatus::Failed);
        assert!(matches!(
            real.events(reply).last(),
            Some(crate::protocol::EventKind::MessageFailed { error, .. }) if error.code == "sidecar_stopped"
        ));
        wait_for("the restart", Duration::from_secs(10), || {
            real.supervisor.status().state == SidecarState::Restarting
        });
        real.wait_ready();
        let echo = real.start("echo", json!({ "text": "back again" }));
        assert_eq!(real.wait_ended(echo).content, "back again");
    }

    #[test]
    #[ignore = "starts the real sidecar through uv"]
    fn real_sidecar_pauses_a_workflow_and_resumes_it_after_approval() {
        use crate::library::{Branch, Step, StepKind, Workflow};
        use crate::protocol::MessageStatus;
        let real = real();
        let mut spec = crate::runs::test_support::spec("echo", json!({ "text": "late blight" }));
        let trait_id = spec.traits[0].id;
        let echo = |id: &str| Step { id: id.into(), label: None, kind: StepKind::Trait { trait_id } };
        let branch = |label: &str, id: &str| Branch { label: label.into(), steps: vec![echo(id)] };
        let approval = StepKind::Approval { prompt: "Go on?".into() };
        spec.workflow = Workflow {
            steps: vec![
                Step {
                    id: "split".into(),
                    label: None,
                    kind: StepKind::Parallel { branches: vec![branch("A", "a"), branch("B", "b")] },
                },
                Step { id: "ask".into(), label: None, kind: approval },
                echo("last"),
            ],
        };
        let conversation = crate::conversations::create(&real.project).unwrap().id;
        let input = crate::conversations::SendMessageInput {
            content: "late blight".into(),
            attachments: Vec::new(),
            text_components: Vec::new(),
        };
        let message = crate::conversations::send_message(
            &real.project, conversation, input, crate::protocol::new_id(),
        )
        .unwrap();
        let reply = real
            .calls
            .start(Arc::clone(&real.project), conversation, &message, spec, None)
            .unwrap();
        let paused = real.wait_ended(reply);
        assert_eq!(paused.status, MessageStatus::Paused);
        assert_eq!(paused.content, "");
        let names: Vec<&str> = paused.steps.iter().map(|s| s.step_id.as_str()).collect();
        assert_eq!(names.len(), 4);
        assert!(names.contains(&"a") && names.contains(&"b") && names.ends_with(&["ask"]));

        let approval = paused.components[0].id;
        let saved =
            crate::conversations::answer_approval(&real.project, reply, approval, true).unwrap();
        real.calls.resume(Arc::clone(&real.project), conversation, saved, None);
        let done = real.wait_ended(reply);
        assert_eq!(done.status, MessageStatus::Complete);
        assert_eq!(done.content, "late blight");
        assert!(done.steps.iter().all(|s| s.done));
    }

    #[test]
    fn log_rotates_once_at_the_size_limit() {
        let dir = tempfile::tempdir().unwrap();
        let log = SidecarLog::with_limit(dir.path(), 100);
        for i in 0..20 {
            log.line(&format!("line {i} with some padding text"));
        }
        let current = dir.path().join("sidecar.log");
        let previous = dir.path().join("sidecar.log.1");
        assert!(previous.exists());
        assert!(std::fs::metadata(&current).unwrap().len() < 200);
        assert!(std::fs::read_to_string(&current).unwrap().contains("line 19"));
        assert!(!dir.path().join("sidecar.log.1.1").exists());
    }
}
