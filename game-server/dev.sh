#!/usr/bin/env bash
#
# Rebuild and restart the game server whenever a source file changes.
#
# C++ has no hot reload: the running binary is a snapshot of the code as it was
# at build time, so editing a header changes nothing until you rebuild. This
# watches src/, include/ and CMakeLists.txt and does that for you.
#
# The browser reconnects on its own a second after the socket drops (see
# RECONNECT_DELAY_MS in web/lib/websocket.ts), so a save is usually visible
# without touching the page. The run is lost, though - each connection gets a
# fresh Game, so the board restarts.
#
# Usage:  ./dev.sh          (from game-server/)
#         PORT=9000 ./dev.sh

set -uo pipefail
cd "$(dirname "$0")"

BUILD_DIR=${BUILD_DIR:-build}
WATCHED=(src include CMakeLists.txt)
server_pid=""

# BSD stat (macOS) and GNU stat (Linux) disagree on flags; support both so the
# script is not the thing that ties this repo to one platform.
if stat -f "%m" . >/dev/null 2>&1; then
  stat_fmt=(stat -f "%N %m")
else
  stat_fmt=(stat -c "%n %Y")
fi

fingerprint() {
  find "${WATCHED[@]}" -type f -exec "${stat_fmt[@]}" {} + 2>/dev/null | sort
}

stop_server() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null
    wait "$server_pid" 2>/dev/null
  fi
  server_pid=""
}

trap 'echo; stop_server; exit 0' INT TERM

rebuild_and_restart() {
  stop_server
  echo "── building ──────────────────────────────────────────"
  if cmake --build "$BUILD_DIR"; then
    "./$BUILD_DIR/game-server" &
    server_pid=$!
  else
    echo "── build failed; waiting for the next change ─────────"
  fi
}

[[ -d "$BUILD_DIR" ]] || cmake -S . -B "$BUILD_DIR" >/dev/null

rebuild_and_restart
last=$(fingerprint)

while true; do
  sleep 1
  now=$(fingerprint)
  if [[ "$now" != "$last" ]]; then
    last=$now
    echo
    echo "── change detected ───────────────────────────────────"
    rebuild_and_restart
  fi
done
