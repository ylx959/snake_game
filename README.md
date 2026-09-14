# Snake Game — retro ’90s style

A server-authoritative snake game, solo or five at a time. A Python game server
owns every rule and runs the clock; the browser draws the state it is sent and
forwards key presses. The board is the page - it fills the window, and every
apple flips the whole screen, background and snake alike, to the next colour
pair.

## Highlights

- Authoritative Python game loop: the server owns movement, food, scoring, death and the tick rate
- **Solo**: one snake on a 48x27 board, with a global top-100 written by the server itself
- **Group**: up to five snakes on one shared 64x36 board, one room, one clock, last one standing
- Kahoot-style six-character room codes, with no accounts, passwords or email anywhere
- Every death on a shared board decided before any snake moves, so message order cannot matter
- Full-bleed canvas board, letterboxed to a fixed 16:9 grid at any window size
- Whole-screen palette cycling on a solo run, driven by a server-sent index; every other screen is black and white
- Readouts that turn white wherever a snake passes behind them, via a `clip-path` mask over duplicated text
- Keyboard control matched on physical key position, with Space and R routed through the on-screen buttons
- 322 backend tests grouped by marker, covering the rules without a socket or an event loop

## Built with

- [Python](https://www.python.org/) 3.11+ with [FastAPI](https://fastapi.tiangolo.com/) and [uvicorn](https://www.uvicorn.org/)
- [pytest](https://docs.pytest.org/), and SQLite through the standard library
- [Next.js](https://nextjs.org/) App Router and [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/), Canvas 2D, and hand-written CSS

## Local Development

Both servers must be running. Use two terminals.

The game server needs Python 3.11+ and four pinned dependencies in a virtualenv:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
./dev.sh
```

The game server runs on:

```text
ws://127.0.0.1:8000/ws
```

`./dev.sh` is `uvicorn --reload`; `PORT=9000 ./dev.sh` moves it, and
`.venv/bin/python main.py` runs it without reload.

The front end needs Node 20+:

```bash
cd web
npm install
npm run dev
```

The local development server runs on:

```text
http://127.0.0.1:3000
```

The game server binds **loopback only**, so use `127.0.0.1`, not `localhost` -
on macOS `localhost` may resolve to `::1` first and fail.

Create and inspect a production build:

```bash
npm run build
npm start
```

Check types and lint the front end:

```bash
npm run typecheck
npm run lint
```

## Configuration

### Front end

The backend URL is read from an environment file, copied from
`web/.env.local.example`:

```text
web/.env.local
```

```text
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000/ws
```

Without it the client falls back to the same default address.

### Back end

One variable, copied from `backend/.env.example`:

```text
DATABASE_URL=sqlite:///./leaderboard.db
```

That file appears next to the server on first run and is gitignored. Rooms are
not configured because rooms are not stored: they live in memory, and a room is
worth nothing once everyone has left. The leaderboard is the only thing that
outlives the process.

```text
sqlite:///./leaderboard.db    a file - the default
sqlite:///:memory:            nothing survives the process
postgresql://user@host/db     raises; see below
```

Deploying means pointing `DATABASE_URL` at a real database. The data access
layer is a `LeaderboardRepository` Protocol in
`backend/leaderboard/repository.py`, and `repository_from_env()` dispatches on
the URL scheme - so Postgres is a new class implementing four methods and one
extra branch there, and nothing above that layer changes. Until it exists, a
`postgresql://` URL **raises on startup** rather than silently falling back to a
local file, because a deployed server quietly writing its scoreboard to a
container's disk looks exactly like a working one until it restarts.

## Playing

### Solo

Pick a nickname, look at the top ten, and play. The rules are the ones the game
has always had: the snake waits in the middle until your first arrow key, arrows
or WASD steer and start, Space pauses and resumes, R resets, and an apple grows
you by one and flips the palette.

When the run ends, **the server** writes the score. There is no client message
that carries a score, so there is nothing for a browser to inflate; one finished
run writes exactly one row. Ties are broken by who got there first.

A run that ate nothing is not recorded: it is the commonest way to leave the
board and says nothing about anyone. You are still told what you scored.

A name in the visible top ten is spoken for: nobody else can play under it, so
nobody can appear to be one of the names on the board. The check folds case and
is made fresh on every claim, because the table moves. It applies in rooms too,
and it applies to the holder as well - getting into the top ten retires that
name.

### Group

One player creates a room and gets a six-character code from the server - upper
case, with no `O`, `0`, `I` or `1` in the alphabet, because a code is meant to
be read off somebody else's screen. Up to five play; two is the minimum; the
first one in is the host and only the host can start.

After a synchronised `3 · 2 · 1`, every snake starts at once on one 64x36 board.
Each player gets a colour the server hands out. The board is black, with a white
frame marking the walls: the palette cycling belongs to a solo run, and one
fixed ground is what lets five player colours be told apart the same way in
every round. The snakes are drawn exactly as solo draws its own - same square
segments, same eyes - so a room looks like the game rather than like a different
one. Your own carries a small name tag on its head, and the corner roster
numbers and names everyone, so telling the snakes apart never depends on telling
the colours apart.

```text
Wall, or your own body            you die
Another snake's body              you die; they do not
Two heads into the same cell      everyone in that cell dies
Two snakes swapping places        both die
```

An apple is worth 1. There are no kill points - deciding who is to blame for a
collision is not something this version can do reliably. Two snakes reaching one
apple together is not a special case: they have already died to the head-on
rule, so the apple is still there.

The board carries two apples for two players, three for three, four for four or
five. Death removes your body from the board; you keep watching, on the same
socket, with the live standing still updating, and your keys stop counting.
The round ends when one snake is left. Ranking is survival first, score second,
and players level on both share a place. **Room scores never reach the solo
leaderboard.**

## Tests

The rules are tested on the Python side, with no browser:

```bash
cd backend
.venv/bin/pytest
```

Every case carries a marker mirroring the file it lives in, so one group can be
run alone:

```bash
.venv/bin/pytest -m multiplayer
.venv/bin/pytest -k "absent food"
```

```text
snake        the body, growth, and the turn buffer
collision    wall and self collision
game         the tick, food, score and status
wire         the serialized shape the browser receives
command      parsing and applying client messages
multiplayer  several snakes on one board, resolved in lockstep
room         codes, lobbies, the host, and the room lifecycle
leaderboard  the solo high-score store
protocol     the full client/server contract, over a real socket
```

`protocol` is the only group that is not instant: it opens real WebSockets and
waits out a shortened countdown.

The front end is checked rather than unit tested, plus a couple of geometry
cases:

```bash
cd web
npm run typecheck
npm run lint
npm run build
npm test
```

## The Wire Contract

One set of messages is written twice, and there is no schema or codegen between
them. **Change one, change the other in the same commit.**

```text
backend/protocol.py          every message, in and out
backend/game/game.py         Game.to_dict()               -> "state"
backend/game/multiplayer.py  MultiplayerGame.to_dict()    -> "game_state"
backend/room/room.py         lobby_state() / results()
web/types/game.ts            ServerMessage / ClientMessage
```

`docs/protocol.md` is the full reference: every message, the limits, the error
codes, and the room lifecycle.

One key press, end to end - a turn is a round trip, and the browser draws
nothing until the server has answered:

```text
          player presses W
                  ↓
  web/lib/input.ts             the key's position -> a ClientMessage
                  ↓
  web/lib/websocket.ts         send({ type: "turn", direction: "UP" })
                  ↓
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  ws://127.0.0.1:8000/ws
                  ↓
  backend/main.py              the receive loop
                  ↓
  backend/protocol.py          parse() -> Turn(UP)
                  ↓
  backend/connection.py        routed to the solo game or to the room
                  ↓
  Game.turn / GameRoom.turn    buffered; the committed heading is untouched
                  ↓
  tick()                       the next tick is what actually moves anything
                  ↓
  to_dict()                    {"type": "state" | "game_state", ...}
                  ↓
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   (a room's tick goes to everyone in it)
                  ↓
  hooks/useGameSession.ts      server messages reduced into React state
                  ↓
  components/game/GameCanvas.tsx
                  ↓
  lib/renderer.ts              repaints the board it was handed
```

Two things bend that rule deliberately. **Colour**: the server sends `palette`,
an integer index that advances with every apple, and the hex pairs live in
`web/lib/palette.ts`, so a colour can be retuned without restarting the backend.
Only a solo run paints it; loading, the menus, a lobby, a shared board and a
result are black ground and white type.
**Board size**: the grid is the server's, and the browser only decides how large
to draw it, so resizing the window scales the whole game by one factor and can
never end a run.

## Project Structure

```text
.
├── backend/                    # Python game server
│   ├── main.py                 # FastAPI wiring: /ws, /health, the janitor
│   ├── connection.py           # one player's session: menu, solo or a room
│   ├── protocol.py             # every message, in and out. No side effects.
│   ├── transport.py            # the socket end of a player's outbox
│   ├── dev.sh                  # uvicorn --reload on 127.0.0.1
│   ├── .env.example            # DATABASE_URL
│   ├── game/                   # rules. No sockets, no asyncio, no rooms.
│   │   ├── game.py             # solo: the tick, food, score, status, palette
│   │   ├── multiplayer.py      # several snakes on one board, in lockstep
│   │   ├── spawns.py           # a symmetric start per player count
│   │   ├── snake.py            # body, heading, turn buffering, growth
│   │   ├── collision.py        # pure wall and self-collision predicates
│   │   └── command.py          # the solo commands, as values
│   ├── room/                   # who is playing together. Synchronous.
│   │   ├── room.py             # GameRoom: roster, host, lifecycle
│   │   ├── manager.py          # create, find, join, leave, sweep
│   │   ├── clock.py            # one task per round - the only async part
│   │   ├── session.py          # PlayerSession: id, nickname, outbox
│   │   ├── codes.py            # six characters, no look-alikes
│   │   └── nickname.py         # validation
│   ├── leaderboard/
│   │   └── repository.py       # the Protocol, and the SQLite implementation
│   └── tests/                  # pytest, one file per marker group
├── web/                        # Next.js front end
│   ├── app/
│   │   ├── page.tsx            # the stage, and which screen is on it
│   │   ├── layout.tsx          # the pixel font
│   │   └── globals.css         # the stage and the screens, sized in cells
│   ├── components/
│   │   ├── game/               # the board and the readouts over it
│   │   ├── screens/            # loading, menu, lobby, round, results
│   │   └── ui/                 # the panel, and the two input fields
│   ├── hooks/
│   │   ├── useGameSession.ts   # the only React <-> socket seam
│   │   └── useBoardRect.ts     # measures the window
│   ├── lib/                    # no React imported anywhere below here
│   │   ├── websocket.ts        # the WebSocket client
│   │   ├── input.ts            # keys -> commands, by key position
│   │   ├── renderer.ts         # canvas drawing, stateless per frame
│   │   ├── palette.ts          # the colour pairs, and the player colours
│   │   ├── nickname.ts         # the same rule as the server, run early
│   │   └── board.ts            # where the board sits, and how big
│   ├── types/game.ts           # the wire contract, client side
│   └── next.config.ts          # dev origins and dev indicators
├── docs/protocol.md            # every message, limit and error code
├── CLAUDE.md                   # working notes on the load-bearing details
└── education.md                # a teaching guide to this code, in Chinese
```

## Controls

```text
Arrows / WASD   steer, and start a solo run
Space           pause and resume            (solo)
R               reset                       (solo)
```

Space and R do nothing while a text field has focus, and nothing in a room -
a round belongs to everyone in it, so no one player can pause it.

## Privacy

No email, no password, no account, no OAuth. A nickname is a one-off label typed
per session, remembered in `localStorage` only so the box comes back filled in.
The server stores nicknames and scores for finished solo runs, and nothing else.

## Rights

© 2026 YLX. All rights reserved. The source is published for review; it is not
licensed for reuse.
