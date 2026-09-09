import sys
from pathlib import Path

# The package lives next to `tests/`, and there is no install step for a local
# dev toy, so put the backend root on the path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
