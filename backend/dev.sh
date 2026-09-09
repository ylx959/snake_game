#!/usr/bin/env bash
# Reload-on-change dev server. `uvicorn --reload` watches the tree itself, so
# there is nothing here for this script to do but pick the port.
set -euo pipefail
cd "$(dirname "$0")"
exec .venv/bin/uvicorn main:app --host 127.0.0.1 --port "${PORT:-8000}" --reload
