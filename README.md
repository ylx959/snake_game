# Snake

A server-authoritative snake game. A Python game server owns every rule and runs
the clock; the browser draws the state it is sent and forwards key presses. The
board is the page - it fills the window, and every apple flips the whole screen,
background and snake alike, to the next colour pair.

## Highlights

- Authoritative Python game loop: the server owns movement, food, scoring, death and the tick rate
- WebSocket session per player, with one `Game` instance and one clock task each
- Full-bleed canvas board, letterboxed to a fixed 48x27 (16:9) grid at any window size
- Whole-screen palette cycling driven by a server-sent index, with the hex values kept on the client
- Readouts that turn white wherever the snake passes behind them, via a `clip-path` mask over duplicated text
- Keyboard control matched on physical key position, with Space and R routed through the on-screen buttons
- 84 backend tests grouped by marker, covering the rules without a socket or an event loop

## Built with

- [Python](https://www.python.org/) 3.11+ with [FastAPI](https://fastapi.tiangolo.com/) and [uvicorn](https://www.uvicorn.org/)
- [pytest](https://docs.pytest.org/)
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

The backend URL is read from an environment file, copied from
`web/.env.local.example`:

```text
web/.env.local
```

```text
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000/ws
```

Without it the client falls back to the same default address.

## Tests

The rules are tested on the Python side, with no socket and no browser:

```bash
cd backend
.venv/bin/pytest
```

Every case carries a marker mirroring the file it lives in, so one group can be
run alone:

```bash
.venv/bin/pytest -m wire
.venv/bin/pytest -k "absent food"
```

```text
snake      the body, growth, and the turn buffer
collision  wall and self collision
game       the tick, food, score and status
wire       the serialized shape the browser receives
command    parsing and applying client messages
```

## The Wire Contract

One message shape is written twice, and there is no schema or codegen between
them:

```text
backend/game/game.py   Game.to_dict()
web/types/game.ts      GameState
```

Change one, change the other in the same commit. The server pushes
`{"type": "state", ...}` every tick; the client sends
`{"type": "turn" | "start" | "pause" | "reset" | "resize"}` and never computes
game state itself.

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
  backend/game/command.py      parse_command() -> Turn(UP), then apply()
                  ↓
  Game.turn(Direction.UP)      buffered; the committed heading is untouched
                  ↓
  Game.tick()                  the next tick is what actually moves the snake
                  ↓
  Game.to_dict()               {"type": "state", ...}
                  ↓
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                  ↓
  hooks/useSnakeGame.ts        server state mirrored into React state
                  ↓
  components/game/GameCanvas.tsx
                  ↓
  lib/renderer.ts              repaints the board it was handed
```

Two things bend that rule deliberately. **Colour**: the server sends `palette`,
an integer index that advances with every apple, and the hex pairs live in
`web/lib/palette.ts`, so a colour can be retuned without restarting the backend.
**Board size**: the grid is the server's, and the browser only decides how large
to draw it, so resizing the window scales the whole game by one factor and can
never end a run.

## Project Structure

```text
.
├── backend/                    # Python game server
│   ├── main.py                 # FastAPI wiring: /ws, /health, the tick loop
│   ├── dev.sh                  # uvicorn --reload on 127.0.0.1
│   ├── requirements.txt        # FastAPI, uvicorn, pytest, httpx - pinned
│   ├── pyproject.toml          # pytest markers
│   ├── game/
│   │   ├── game.py             # the tick, food, score, status, palette
│   │   ├── snake.py            # body, heading, turn buffering, growth
│   │   ├── collision.py        # pure wall and self-collision predicates
│   │   └── command.py          # client messages -> values, then applied
│   └── tests/                  # pytest, one file per marker group
├── web/                        # Next.js front end
│   ├── app/
│   │   ├── page.tsx            # the game, and the whole site
│   │   ├── layout.tsx          # the pixel font
│   │   └── globals.css         # the stage, sized in cells
│   ├── components/game/
│   │   ├── GameCanvas.tsx      # the board, sized by its own laid-out box
│   │   ├── LitText.tsx         # text lit white by the snake behind it
│   │   ├── ScoreBoard.tsx      # score and connection readout
│   │   ├── Prompt.tsx          # the one big line of text
│   │   ├── StartPauseButton.tsx
│   │   └── Hint.tsx            # the controls line
│   ├── hooks/
│   │   ├── useSnakeGame.ts     # the only React <-> socket seam
│   │   └── useBoardRect.ts     # measures the window
│   ├── lib/                    # no React imported anywhere below here
│   │   ├── websocket.ts        # the WebSocket client
│   │   ├── input.ts            # keys -> commands, by key position
│   │   ├── renderer.ts         # canvas drawing, stateless per frame
│   │   ├── palette.ts          # the colour pairs
│   │   └── board.ts            # where the board sits, and how big
│   ├── types/game.ts           # the wire contract, client side
│   └── next.config.ts          # dev origins and dev indicators
├── CLAUDE.md                   # working notes on the load-bearing details
└── education.md                # a teaching guide to this code, in Chinese
```

## Controls

```text
Arrows / WASD   steer, and start the run
Space           pause and resume
R               reset
```

## Rights

© 2026 YLX. All rights reserved. The source is published for review; it is not
licensed for reuse.
