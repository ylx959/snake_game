# WebSocket protocol

One endpoint, `ws://127.0.0.1:8000/ws`, carrying JSON objects in both
directions. Every message has a `type`, and that is the only field common to all
of them.

The contract is written twice and there is no schema and no codegen between the
two halves:

```text
backend/protocol.py          parse() and the message builders
backend/game/game.py         Game.to_dict()               -> "state"
backend/game/multiplayer.py  MultiplayerGame.to_dict()    -> "game_state"
backend/room/room.py         GameRoom.lobby_state()       -> "lobby_state"
                             GameRoom.results()           -> "results"
web/types/game.ts            ServerMessage / ClientMessage
```

**Change one, change the other in the same commit.** The `wire` and `protocol`
test groups pin the Python side - they assert the exact key set, so a field
renamed or dropped there fails - but nothing checks that `types/game.ts` agrees,
so a field added on one side alone still slips through.

`PROTOCOL_VERSION` (in `backend/protocol.py`, echoed in the `loading` frame) is
bumped when a message changes shape, so a browser tab left open across a deploy
can tell rather than misread.

## Identity

The server assigns every connection an unguessable `player_id`
(`secrets.token_urlsafe(16)`) and tells that connection its own id once, in
`menu_ready`, as `you`. The browser needs it for exactly one thing: knowing
which snake on a shared board is the player's. It is never shown and never
typed.

A **nickname is a label, not an identity**. It is 2-12 characters, trimmed, with
runs of whitespace collapsed, no control or bidirectional-override characters,
and not obviously offensive. It must be unique within a room and may repeat
freely across rooms. The server never uses it to decide who did something.

## Limits

| Limit | Value | Where |
|---|---|---|
| Message size | 1024 bytes | `protocol.MAX_MESSAGE_BYTES` |
| Message rate | 30/s sustained, 60 burst | `connection.RATE_LIMIT_*` |
| Outbox backlog | 64 messages, then the client is dropped | `transport.OUTBOX_LIMIT` |
| Turns accepted | one per player per tick, while running | `MultiplayerGame.turn` |

A message that fails to parse is **ignored** - the connection stays open and
nothing is sent back. Only a command that was understood and then refused
produces an `error`.

## Client -> server

| `type` | Fields | Meaning |
|---|---|---|
| `set_nickname` | `nickname` | Claim a display name. Refused while in a room. |
| `create_room` | `nickname?` | Open a room and become its host. |
| `join_room` | `code`, `nickname?` | Join by code. Case and spacing are forgiven. |
| `leave_room` | - | Leave; mid-round this is a death. |
| `ready` | `ready` (bool) | A lobby flag. Does not gate starting. |
| `start_room` | - | Host only, two players or more. |
| `play_again` | - | From the results, back to the same lobby. |
| `turn` | `direction` | `UP` / `DOWN` / `LEFT` / `RIGHT`. Works in both modes. |
| `solo_enter` | `nickname?` | Open the solo board. Comes back READY - it does **not** start the game. |
| `solo_start` | - | Start, or resume from a pause. The Start button, and Space. |
| `solo_pause` | - | One key, so the server decides pause or resume. |
| `solo_reset` | - | Start the run over. |
| `solo_exit` | - | Drop the solo game and go back to the menu. |
| `get_leaderboard` | `limit?` | Defaults to 10; capped at 100. |
| `resize` | `width`, `height` | Solo only; ignored without a game. Nothing sends it. |

Where a command takes `nickname?`, the name is claimed first and the command
then runs; omitting it uses the session's current name, and having none is
`nickname_required`. The menus always send it this way rather than through
`set_nickname`, so a refusal stops the command instead of racing it.

A name is refused with `nickname_reserved` when it is already in the **visible
top ten** of the leaderboard - including for the player who put it there. The
check folds case and is made fresh on every claim.

**There is no message that carries a score.** The only way into the leaderboard
is finishing a game this server ran - and a run that scored **0** is not written
down at all (`MIN_RECORDED_SCORE`). The player is still told what they scored;
the table just does not keep it.

`solo_enter` opens the board without starting it, because the opening pause is
part of the game: the snake stands in the middle under the prompt until the
player's first arrow key. `solo_start` is the Start button.

## Server -> client

| `type` | Fields | When |
|---|---|---|
| `loading` | `protocol` | First frame after the socket opens. |
| `menu_ready` | `you`, `nickname`, `config` | Second frame, and after leaving a room or solo. |
| `nickname_set` | `nickname` | A name was accepted. |
| `state` | the solo board | Every solo tick. |
| `game_state` | the shared board | Every room tick. |
| `room_created` | `code`, `lobby` | To the host only. |
| `room_joined` | `code`, `lobby` | To the joiner only. |
| `lobby_state` | the roster | Whenever a room's roster or status changes. |
| `player_joined` | `player_id`, `nickname`, `color` | To everyone already in the room. |
| `player_left` | `player_id`, `nickname` | To everyone still in the room. |
| `countdown` | `code`, `seconds` | Once a second, 3 to 1, to the whole room. |
| `results` | `code`, `rankings` | When a round ends. |
| `leaderboard` | `entries`, `last_score` | On request, and after a solo run. |
| `error` | `code`, `message` | A command was understood and refused. |

`config` in `menu_ready` carries both board shapes, the player bounds, the code
length, the nickname bounds and the palette count, so the browser hard-codes
none of them.

### Why solo is `state` and a room is `game_state`

They are different shapes - one snake and one apple against several snakes, a
list of apples and a roster - and giving them one tag would mean every reader
branching on a field instead of on the tag. Solo kept the older name because its
payload has not changed.

## Error codes

The server sends a stable `code` and a short, deliberately incurious `message`.
Nothing about the server's internals - no exception, no traceback, no hint about
what else is on it - ever reaches a client.

```text
already_started      bad_code             nickname_blocked     nickname_invalid
nickname_required    nickname_reserved    nickname_taken       nickname_too_long
nickname_too_short
not_enough_players   not_host             not_in_room          rate_limited
room_full            room_in_progress     room_not_found       room_unavailable
```

## Room lifecycle

```text
WAITING ──start_room──► COUNTDOWN ──3s──► RUNNING ──one left──► RESULTS
   ▲                                                               │
   └───────────────────────── play_again ──────────────────────────┘
   │
   └──► EMPTY   last player out, or 15 minutes idle while not playing
```

A room has **one clock task** (`backend/room/clock.py`), created when the host
starts and gone when the round ends. It is the only thing in the process that
can advance that room's game, which is what makes "everybody is on the same
tick" true by construction rather than by agreement.

## One tick on a shared board

The staging is the fairness guarantee. Nothing moves until every death is
decided, so no player's fate can depend on whose message arrived first.

```text
1. next_head() for every living snake, from one snapshot
2. every death, against that same snapshot - nothing has moved yet
     wall  ·  own body (tail forgiven)  ·  another snake's body (tail included)
     two heads into one cell  ·  two heads swapping places
3. food, awarded to surviving snakes in slot order
4. the survivors move (growing first, so score and length land together)
5. eaten apples reappear on a free interior cell
6. one payload, broadcast to the whole room
```

A contested apple needs no arrival-order rule: two heads entering one cell have
already died to the head-on rule, so the apple is simply still there.
