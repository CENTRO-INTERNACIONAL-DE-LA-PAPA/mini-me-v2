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
# smaller. Names are matched under the runtime's library folder.
UNUSED_STDLIB = ["test", "idlelib", "tkinter", "turtledemo", "ensurepip", "lib2to3"]

LAUNCH_PY = '''\
import sys
from pathlib import Path

# Started with `python -I`, which leaves this folder off `sys.path`.
sys.path.insert(0, str(Path(__file__).resolve().parent / "packages"))

from mini_me_sidecar.__main__ import main

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


def main() -> None:
    version = (SIDECAR / ".python-version").read_text().strip()
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)

    python_root = install_python(version)
    shutil.copytree(python_root, OUT / "python", symlinks=True)
    library = library_folder(OUT / "python")
    for name in UNUSED_STDLIB:
        shutil.rmtree(library / name, ignore_errors=True)
    if sys.platform == "win32":
        shutil.rmtree(OUT / "python" / "tcl", ignore_errors=True)

    packages = OUT / "packages"
    packages.mkdir()
    requirements = BUILD / "requirements.txt"
    run("uv", "export", "--project", SIDECAR, "--frozen", "--no-dev", "--no-emit-project",
        "--no-hashes", "--format", "requirements.txt", "--output-file", requirements)
    wanted = [line for line in requirements.read_text().splitlines()
              if line.strip() and not line.lstrip().startswith("#")]
    if wanted:
        python = OUT / "python" / ("python.exe" if sys.platform == "win32" else "bin/python3")
        run("uv", "pip", "install", "--python", python, "--target", packages,
            "--requirements", requirements)

    shutil.copytree(SIDECAR / "src" / "mini_me_sidecar", packages / "mini_me_sidecar",
                    ignore=shutil.ignore_patterns("__pycache__"))
    (OUT / "launch.py").write_text(LAUNCH_PY)
    print(f"sidecar bundled in {OUT}")


if __name__ == "__main__":
    main()
