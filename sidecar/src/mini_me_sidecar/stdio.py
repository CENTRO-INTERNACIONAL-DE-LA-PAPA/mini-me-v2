import os
import sys
from typing import BinaryIO


def reserve_stdout() -> BinaryIO:
    """Returns a private handle on the original stdout and points descriptor 1 at stderr.

    Native libraries write to descriptor 1 directly, bypassing `sys.stdout`, so redirecting
    only `sys.stdout` would let their output corrupt the link.
    """
    sys.stdout.flush()
    link_fd = os.dup(1)
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    return os.fdopen(link_fd, "wb", buffering=0)
