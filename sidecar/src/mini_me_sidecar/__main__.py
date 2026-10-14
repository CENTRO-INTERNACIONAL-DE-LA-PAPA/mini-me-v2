"""`python -I -m mini_me_sidecar [--test-traits]`: the sidecar started by the Rust core."""

import sys

USAGE = """usage: python -I -m mini_me_sidecar [--test-traits]

Speaks the Mini-Me link protocol on standard input and output. Started by the Rust core.

  --test-traits  also register the Traits used by the Rust tests
"""


def main() -> None:
    args = sys.argv[1:]
    if "--help" in args or "-h" in args:
        sys.stdout.write(USAGE)
        return

    from mini_me_sidecar.stdio import reserve_stdout

    # Reserve stdout before importing anything else, so output printed while modules load
    # cannot reach the link.
    link_out = reserve_stdout()

    from mini_me_sidecar.app import run

    run(link_out, test_traits="--test-traits" in args)


if __name__ == "__main__":
    main()
