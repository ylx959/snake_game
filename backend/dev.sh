#!/usr/bin/env bash
# Reload-on-change dev server. `uvicorn --reload` watches the tree itself, so
# there is nothing here for this script to do but pick the port and hand over
# the environment.
set -euo pipefail
cd "$(dirname "$0")"

# Nothing else in the tree loads a .env: repository_from_env() reads os.environ
# and stops there. `--env-file` is what puts DATABASE_URL in it, through the
# python-dotenv that uvicorn[standard] already pins. Absent .env, the default
# sqlite:///./leaderboard.db still applies.
env_file=()
[ -f .env ] && env_file=(--env-file .env)

exec .venv/bin/uvicorn main:app \
  --host 127.0.0.1 --port "${PORT:-8000}" "${env_file[@]}" --reload
