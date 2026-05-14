from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_SHARED_SCHEMA_PY = _REPO_ROOT / "packages" / "shared-schemas" / "py"
if str(_SHARED_SCHEMA_PY) not in sys.path:
    sys.path.insert(0, str(_SHARED_SCHEMA_PY))
