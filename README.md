# Snake

Server-authoritative snake. A C++ game server owns every rule; the browser only
draws what it is told and forwards key presses.

```
snake_game/
├── web/                        # Next.js front end
│   ├── app/
│   │   ├── page.tsx            # home
│   │   └── game/page.tsx       # the game page
│   ├── components/game/
│   │   ├── GameCanvas.tsx      # draws the board
│   │   └── ScoreBoard.tsx      # score + connection readout
│   ├── hooks/useSnakeGame.ts   # the React <-> socket seam
│   ├── lib/
│   │   ├── websocket.ts        # WS client (no React)
│   │   ├── input.ts            # keys -> commands
│   │   └── renderer.ts         # canvas drawing
│   └── types/game.ts           # the wire contract
│
└── game-server/                # C++ game server
    ├── src/
    │   ├── main.cpp            # session wiring: one Game per connection
    │   ├── Game.cpp            # the tick, scoring, food
    │   ├── Snake.cpp           # body, heading, growth
    │   ├── Collision.cpp       # wall and self collision
    │   └── WebSocketServer.cpp # RFC 6455, on POSIX sockets
    ├── include/
    ├── tests/core_tests.cpp
    └── CMakeLists.txt
```

## Why it is split this way

The server is the only thing that decides what is true. It runs the clock, so a
client cannot move faster by sending more messages, and every rule is tested
without a socket in sight. The browser holds no game state at all: it renders
the last state it received and sends key presses back.

`web/types/game.ts` and `Game::toJson()` are the same contract written twice.
Change one, change the other in the same commit.

## Requirements

- CMake 3.16+ and a C++20 compiler. The server has **no third-party
  dependencies** - the WebSocket handshake and frame codec are in
  `WebSocketServer.cpp`.
- Node 20+ for the front end.

## Run it

Two terminals.

```bash
# 1. the game server (ws://127.0.0.1:8000/ws)
cd game-server
cmake -S . -B build
cmake --build build
./build/game-server          # PORT=9000 ./build/game-server to move it
```

```bash
# 2. the front end
cd web
npm install
npm run build && npm start   # http://127.0.0.1:3000
```

Then open <http://127.0.0.1:3000/game>.

If the server does not listen on the default address, point the browser at the
right one with `web/.env.local`:

```
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000/ws
```

## Tests

```bash
cd game-server
cmake --build build && ctest --test-dir build --output-on-failure
```

`core_tests` covers the snake's movement and turn buffering, wall and self
collision, and the game's state machine, scoring, and wire format.

The front end is checked with `npm run typecheck` in `web/`.

## Controls

Arrow keys or WASD to steer, Space to pause and resume, R to restart.
