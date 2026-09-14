/**
 * The wire contract with the Python backend.
 *
 * Mirrors `Game.to_dict()` (backend/game/game.py), `MultiplayerGame.to_dict()`
 * (backend/game/multiplayer.py), `GameRoom.lobby_state()` / `.results()`
 * (backend/room/room.py) and the builders in backend/protocol.py. There is no
 * schema and no codegen between the two sides - if you change a field there,
 * change it here in the same commit.
 */

/** A grid coordinate, `[x, y]`, with y growing downwards. */
export type Cell = [number, number];

export type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

/* --- solo ---------------------------------------------------------------- */

export type GameStatus = "ready" | "running" | "paused" | "game_over";

export interface GameState {
  /** Board size in cells, not pixels. */
  width: number;
  height: number;
  status: GameStatus;
  score: number;
  ticks: number;
  /** Head first. */
  snake: Cell[];
  direction: Direction;
  food: Cell | null;
  /**
   * Which colour pair the board is wearing. An index, never a colour: the hex
   * values live in `lib/palette.ts`. Advances by one with every apple.
   */
  palette: number;
}

/* --- group --------------------------------------------------------------- */

export type MultiStatus = "countdown" | "running" | "finished";

/** One player's snake on a shared board. A dead one reports no cells. */
export interface SnakeView {
  player_id: string;
  nickname: string;
  /** An index into `PLAYER_COLORS`; the server guarantees it is unique in the room. */
  color: number;
  alive: boolean;
  score: number;
  direction: Direction;
  cells: Cell[];
}

export interface MultiplayerState {
  code: string;
  width: number;
  height: number;
  status: MultiStatus;
  ticks: number;
  /** Shared: any player's apple advances it for everybody at once. */
  palette: number;
  food: Cell[];
  snakes: SnakeView[];
  alive: number;
  total: number;
}

export type RoomStatus = "waiting" | "countdown" | "running" | "results" | "empty";

export interface LobbyPlayer {
  player_id: string;
  nickname: string | null;
  color: number;
  ready: boolean;
  host: boolean;
}

export interface LobbyState {
  code: string;
  status: RoomStatus;
  host_id: string | null;
  count: number;
  capacity: number;
  min_players: number;
  players: LobbyPlayer[];
}

/** A room's final table. Survival first, score second; ties share a place. */
export interface Ranking {
  place: number;
  player_id: string;
  nickname: string;
  color: number;
  score: number;
  alive: boolean;
}

/* --- the solo leaderboard ------------------------------------------------ */

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  score: number;
  /** Unix seconds, UTC. The browser formats it; the server does not guess. */
  achieved_at: number;
}

/* --- what the server tells the client about itself ----------------------- */

export interface ServerConfig {
  solo: { width: number; height: number };
  multi: { width: number; height: number };
  min_players: number;
  max_players: number;
  code_length: number;
  nickname: { min: number; max: number };
  palette_count: number;
}

/* --- messages ------------------------------------------------------------ */

/** Anything the server pushes down the socket. */
export type ServerMessage =
  /** The first frame: proof the game server is up, which is what the loading
   *  screen is actually waiting for. */
  | { type: "loading"; protocol: number }
  /**
   * `you` is this connection's own player id. It is never shown and never
   * typed; the browser needs it only to tell which snake on a shared board is
   * the player's own.
   */
  | { type: "menu_ready"; you: string; nickname: string | null; config: ServerConfig }
  | { type: "nickname_set"; nickname: string }
  | ({ type: "state" } & GameState)
  | ({ type: "game_state" } & MultiplayerState)
  | { type: "room_created"; code: string; lobby: LobbyState }
  | { type: "room_joined"; code: string; lobby: LobbyState }
  | ({ type: "lobby_state" } & LobbyState)
  | { type: "player_joined"; player_id: string; nickname: string | null; color: number }
  | { type: "player_left"; player_id: string; nickname: string | null }
  | { type: "countdown"; code: string; seconds: number }
  | { type: "results"; code: string; rankings: Ranking[] }
  | { type: "leaderboard"; entries: LeaderboardEntry[]; last_score: number | null }
  | { type: "error"; code: string; message: string };

/** Anything the browser sends up. The server owns every outcome. */
export type ClientMessage =
  | { type: "set_nickname"; nickname: string }
  | { type: "create_room"; nickname?: string }
  | { type: "join_room"; code: string; nickname?: string }
  | { type: "leave_room" }
  | { type: "ready"; ready: boolean }
  | { type: "start_room" }
  | { type: "play_again" }
  /** Steering: the one command that means something in both modes. */
  | { type: "turn"; direction: Direction }
  /**
   * Open the solo board. Does **not** start the game: it comes back READY, with
   * the snake standing in the middle and the prompt over it, and the run begins
   * on the first arrow key.
   *
   * Carries the nickname for the same reason `create_room` does: this run's
   * score is going on a public table, so the server has to have accepted the
   * name before the run exists rather than racing a separate message against it.
   */
  | { type: "solo_enter"; nickname?: string }
  /** Start, or resume from a pause. The Start button, and Space. */
  | { type: "solo_start" }
  | { type: "solo_pause" }
  | { type: "solo_reset" }
  | { type: "solo_exit" }
  /**
   * Solo only, and nothing here sends it any more - the board's shape is the
   * server's and the window only decides how large to draw it. The server still
   * accepts it, because `Game.resize()` is still a rule the solo game has.
   */
  | { type: "resize"; width: number; height: number }
  | { type: "get_leaderboard"; limit?: number };

export type ConnectionStatus = "connecting" | "open" | "closed";
