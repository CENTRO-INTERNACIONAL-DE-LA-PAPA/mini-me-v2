import os
import sys
from typing import BinaryIO


def reserve_stdout() -> BinaryIO:
    """Points descriptor 1 at stderr and returns the original stdout for the link.

    Native libraries write to descriptor 1 directly, so redirecting only `sys.stdout` is not enough.
    """
    sys.stdout.flush()
    link_fd = os.dup(1)
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    return os.fdopen(link_fd, "wb", buffering=0)
