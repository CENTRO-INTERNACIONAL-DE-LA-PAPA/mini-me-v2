//! Project-folder confinement: every Project file path goes through `ProjectPaths::resolve`.

use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub struct ProjectPaths {
    root: PathBuf,
    /// Used only for containment checks: on Windows, canonical paths carry a `\\?\` prefix
    /// that other programs may not accept, so returned paths are built from `root`.
    canonical_root: PathBuf,
}

impl ProjectPaths {
    pub fn new(root: &Path) -> AppResult<Self> {
        Ok(Self {
            root: root.to_path_buf(),
            canonical_root: std::fs::canonicalize(root)?,
        })
    }

    #[cfg(test)]
    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn database(&self) -> PathBuf {
        self.root.join("project.sqlite")
    }

    /// Resolves a path relative to the Project folder, rejecting absolute paths, `..`
    /// segments, and anything (including symbolic links) that ends up outside the folder.
    /// The path does not need to exist yet; its nearest existing ancestor is checked.
    pub fn resolve(&self, relative: &str) -> AppResult<PathBuf> {
        let relative_path = Path::new(relative);
        for component in relative_path.components() {
            match component {
                Component::Normal(_) | Component::CurDir => {}
                _ => {
                    return Err(AppError::confinement(format!(
                        "'{relative}' is not a path inside the Project"
                    )));
                }
            }
        }

        let joined = self.root.join(relative_path);
        let mut existing: &Path = &joined;
        while existing.symlink_metadata().is_err() {
            existing = existing
                .parent()
                .ok_or_else(|| AppError::confinement("path has no existing ancestor"))?;
        }
        let canonical = std::fs::canonicalize(existing)
            .map_err(|_| AppError::confinement(format!("'{relative}' cannot be resolved")))?;
        if !canonical.starts_with(&self.canonical_root) {
            return Err(AppError::confinement(format!(
                "'{relative}' resolves outside the Project"
            )));
        }
        Ok(joined)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> (tempfile::TempDir, ProjectPaths) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        std::fs::create_dir(&root).unwrap();
        let paths = ProjectPaths::new(&root).unwrap();
        (dir, paths)
    }

    #[test]
    fn accepts_paths_inside() {
        let (_dir, paths) = project();
        let resolved = paths.resolve("assets/abc/file.csv").unwrap();
        assert!(resolved.starts_with(paths.root()));
    }

    #[test]
    fn rejects_parent_segments() {
        let (_dir, paths) = project();
        let err = paths.resolve("assets/../../outside.txt").unwrap_err();
        assert_eq!(err.code, "confinement");
    }

    #[test]
    fn rejects_absolute_paths() {
        let (dir, paths) = project();
        let absolute = dir.path().join("outside.txt");
        let err = paths.resolve(absolute.to_str().unwrap()).unwrap_err();
        assert_eq!(err.code, "confinement");
    }

    #[test]
    fn rejects_symlink_escaping_the_folder() {
        let (dir, paths) = project();
        let outside = dir.path().join("outside");
        std::fs::create_dir(&outside).unwrap();
        let link = paths.root().join("escape");

        #[cfg(unix)]
        let created = std::os::unix::fs::symlink(&outside, &link).is_ok();
        #[cfg(windows)]
        let created = std::os::windows::fs::symlink_dir(&outside, &link).is_ok();

        if !created {
            // Creating symbolic links needs extra privileges on some Windows setups.
            eprintln!("skipping: cannot create a symbolic link on this machine");
            return;
        }
        let err = paths.resolve("escape/file.txt").unwrap_err();
        assert_eq!(err.code, "confinement");
    }
}
