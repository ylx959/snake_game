# Snake

Server-authoritative snake. A Python game server owns every rule; the browser
only draws what it is told and forwards key presses.

The board is the page: it fills the window, and every apple flips the whole
screen - background, snake and all - to the next colour pair.

```
snake_game/
├── web/                        # Next.js front end
│   ├── app/
│   │   ├── page.tsx            # the game, and the whole site
│   │   ├── layout.tsx          # the pixel font
│   │   └── globals.css         # two colours and black
│   ├── components/game/
│   │   ├── GameCanvas.tsx      # the full-bleed board
│   │   ├── ScoreBoard.tsx      # score + connection readout
│   │   └── Prompt.tsx          # the one big line of text
│   ├── hooks/useSnakeGame.ts   # the React <-> socket seam
│   ├── lib/
│   │   ├── websocket.ts        # WS client (no React)
│   │   ├── input.ts            # keys -> commands
│   │   ├── renderer.ts         # canvas drawing
│   │   ├── palette.ts          # the colour pairs
│   │   └── board.ts            # where the board sits, and how big
│   └── types/game.ts           # the wire contract
│
└── backend/                    # Python game server
    ├── main.py                 # FastAPI: /ws, /health, the tick loop
    ├── game/
    │   ├── game.py             # the tick, scoring, food, palette
    │   ├── snake.py            # body, heading, growth
    │   ├── collision.py        # wall and self collision
    │   └── command.py          # client messages -> values
    └── tests/                  # pytest, one file per group
```

## Why it is split this way

The server is the only thing that decides what is true. It runs the clock, so a
client cannot move faster by sending more messages, and every rule is tested
without a socket in sight. The browser holds no game state at all: it renders
the last state it received and sends key presses back.

That includes the colours. The server sends `palette`, an *index*; the hex
values live in `web/lib/palette.ts`, so a colour can be retuned without
touching the backend.

The board is 48x27 - exactly 16:9 - and that is the server's too. The browser
only decides how large to draw it: the biggest 16:9 box the window will hold,
centred, with black around it. Resizing the window scales the whole game by one
factor; it never reshapes the board and never ends a run.

`web/types/game.ts` and `Game.to_dict()` are the same contract written twice.
Change one, change the other in the same commit.

## Requirements

- Python 3.11+ (`match` statements, `X | Y` types). Three dependencies, in a
  virtualenv: FastAPI, uvicorn, pytest.
- Node 20+ for the front end.

## Run it

Two terminals.

```bash
# 1. the game server (ws://127.0.0.1:8000/ws)
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
./dev.sh                     # uvicorn --reload; PORT=9000 ./dev.sh to move it

# or without reload:  .venv/bin/python main.py
```

```bash
# 2. the front end
cd web
npm install
npm run dev                  # http://127.0.0.1:3000
# or, to check a production build:  npm run build && npm start
```

Then open <http://127.0.0.1:3000>.

The game server binds **loopback only**, so use `127.0.0.1`, not `localhost` -
on macOS `localhost` may resolve to `::1` first and fail. If the server does not
listen on the default address, point the browser at the right one with
`web/.env.local`:

```
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000/ws
```

## Tests

```bash
cd backend
.venv/bin/pytest                 # everything
.venv/bin/pytest -m command      # one group
```

81 cases covering the snake's movement and turn buffering, wall and self
collision, the game's state machine, scoring, palette cycling and resizing, the
serialized wire format, and command parsing (including malformed input). Every
case carries a marker, so `-m wire` runs one group.

The front end is checked with `npm run typecheck` and `npm run lint` in `web/`.

## Controls

Arrow keys or WASD to steer, Space to pause and resume, R to restart.
