"""Assembles the sidecar for a release build in `src-tauri/resources/sidecar/`:

    python/      a standalone CPython (python-build-standalone, installed by uv)
    packages/    the locked third-party packages and the `mini_me_sidecar` package
    launch.py    puts `packages/` on `sys.path` and starts the sidecar

Run through `npm run bundle-sidecar`. Uses only the standard library and the `uv` CLI.
"""

import re
import shutil
import subprocess
import sys
from pathlib import Path

SIDECAR = Path(__file__).resolve().parent.parent
REPO = SIDECAR.parent
OUT = REPO / "src-tauri" / "resources" / "sidecar"
BUILD = SIDECAR / "build"

FULL_VERSION = re.compile(r"cpython-\d+\.\d+\.\d+-")

# Parts of the standard library the sidecar never uses; removing them keeps the installer
# smaller. Patterns are matched under the runtime's library folder.
UNUSED_STDLIB = [
    "test", "idlelib", "tkinter", "turtledemo", "ensurepip", "lib2to3", "pydoc_data", "venv",
    "__phello__", "site-packages", "config-3.*", "lib-dynload/_tkinter*",
]

UNUSED_RUNTIME = [
    "include", "tcl", "DLLs/tcl*", "DLLs/tk*", "DLLs/_tkinter*", "lib/pkgconfig", "lib/tcl[0-9]*",
    "lib/tk[0-9]*", "lib/itcl[0-9]*", "lib/thread[0-9]*", "lib/libtcl*", "lib/libtk*",
]

UNUSED_PACKAGES = ["boto3", "botocore", "s3transfer", "jmespath"]

LICENSE_FILE = re.compile(r"^(licen[cs]e|copying|notice|authors)", re.IGNORECASE)

KEPT_METADATA = {"METADATA", "entry_points.txt"}

IMPORT_CHECK = """
import mini_me_sidecar.__main__
import mini_me_sidecar.adapters.data.replies
from asta.literature.client import AstaPaperFinder
from asta.utils.config import get_api_config
from asta_agent.a2a.client import A2AClient
import pandas, pointblank, openpyxl, scipy.stats, sklearn.cluster, sklearn.ensemble
import statsmodels.api, statsmodels.formula.api
"""

LAUNCH_PY = '''\
import sys
from pathlib import Path

# Started with `python -I`, which leaves this folder off `sys.path`.
sys.path.insert(0, str(Path(__file__).resolve().parent / "packages"))

from mini_me_sidecar.__main__ import main

# A spawned data worker runs this file again as `__mp_main__` while it starts; without the
# guard it would start a second sidecar on the same stdin.
if __name__ == "__main__":
    main()
'''


def run(*args: str | Path) -> None:
    print("+", " ".join(str(a) for a in args), flush=True)
    subprocess.run([str(a) for a in args], check=True)


def install_python(version: str) -> Path:
    """Installs CPython `version` into the build folder and returns its root folder."""
    target = BUILD / "python"
    shutil.rmtree(target, ignore_errors=True)
    run("uv", "python", "install", version, "--install-dir", target, "--no-bin")
    # Next to the runtime, uv adds a link named after the minor version only
    # (`cpython-3.14-…`); the runtime itself carries the full version (`cpython-3.14.7-…`).
    roots = [p for p in target.iterdir() if FULL_VERSION.match(p.name)]
    if len(roots) != 1:
        sys.exit(f"expected one CPython in {target}, found {[p.name for p in roots]}")
    return roots[0]


def library_folder(python_root: Path) -> Path:
    if sys.platform == "win32":
        return python_root / "Lib"
    return next((python_root / "lib").glob("python3.*"))


def remove(paths: list[Path]) -> None:
    for path in sorted(paths, key=lambda p: len(p.parts)):
        if path.is_dir() and not path.is_symlink():
            shutil.rmtree(path, ignore_errors=True)
        elif path.exists() or path.is_symlink():
            path.unlink()


def trim_runtime(python_root: Path) -> None:
    library = library_folder(python_root)
    remove([p for pattern in UNUSED_STDLIB for p in library.glob(pattern)])
    remove([p for pattern in UNUSED_RUNTIME for p in python_root.glob(pattern)])


def install_packages(packages: Path, python: Path) -> None:
    requirements = BUILD / "requirements.txt"
    unused = [arg for name in UNUSED_PACKAGES for arg in ("--no-emit-package", name)]
    run("uv", "export", "--project", SIDECAR, "--frozen", "--no-dev", "--no-emit-project",
        "--no-hashes", "--format", "requirements.txt", *unused, "--output-file", requirements)
    wanted = [line for line in requirements.read_text().splitlines()
              if line.strip() and not line.lstrip().startswith("#")]
    if wanted:
        run("uv", "pip", "install", "--python", python, "--target", packages, "--no-deps",
            "--requirements", requirements)


def trim_packages(packages: Path) -> None:
    remove([p for p in packages.rglob("*") if p.is_dir() and p.name in ("tests", "test")])
    remove([p for p in packages.rglob("*") if p.suffix == ".pyi" or p.name == "py.typed"])
    for info in packages.glob("*.dist-info"):
        remove([p for p in info.iterdir() if p.is_file() and not kept_metadata(p)])


def kept_metadata(path: Path) -> bool:
    return path.name in KEPT_METADATA or bool(LICENSE_FILE.match(path.name))


def main() -> None:
    version = (SIDECAR / ".python-version").read_text().strip()
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)

    python_root = install_python(version)
    shutil.copytree(python_root, OUT / "python", symlinks=True)
    trim_runtime(OUT / "python")
    python = OUT / "python" / ("python.exe" if sys.platform == "win32" else "bin/python3")

    packages = OUT / "packages"
    packages.mkdir()
    install_packages(packages, python)
    trim_packages(packages)
    shutil.copytree(SIDECAR / "src" / "mini_me_sidecar", packages / "mini_me_sidecar",
                    ignore=shutil.ignore_patterns("__pycache__"))
    (OUT / "launch.py").write_text(LAUNCH_PY)
    check = f"import sys; sys.path.insert(0, {str(packages)!r})\n{IMPORT_CHECK}"
    run(python, "-I", "-B", "-c", check)
    files = sum(1 for p in OUT.rglob("*") if p.is_file())
    print(f"sidecar bundled in {OUT}: {files:,} files")


if __name__ == "__main__":
    main()
