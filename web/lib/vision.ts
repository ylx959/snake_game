/**
 * What the player can see: where the light is, and which snake cells exist.
 *
 * This file decides **existence**, never brightness. A cell is either drawn or
 * it is not; how dark it ends up is the spotlight's business, and the spotlight
 * is one smooth radial gradient laid over the finished board in `Renderer`.
 * Keeping the two apart is what stops an opponent being dimmed twice - once for
 * being far away, and again by the dark it is standing in.
 *
 * There is exactly one rule here and it is the hard edge: an opponent cell
 * further than `ENEMY_VISIBILITY_RADIUS_CELLS` from your head is not drawn at
 * all, at any opacity. A very faint snake is still a snake on a screen somebody
 * is staring at, so the boundary has to be a cut rather than the end of a fade.
 *
 * That radius is the opponents' alone. The light fades over a different, longer
 * one, so widening or narrowing the spotlight never changes how far you can
 * see another player - and an opponent disappearing never lands on a visible
 * edge in the light.
 *
 * Everything is pure and framework-free, and it is the only place the rule is
 * stated: `Renderer` paints what `applyFog` returns and `LitText` masks against
 * the same cells, so the paint and the mask cannot disagree about what exists -
 * the same reason `cellRectPath` lives in `lib/board.ts`.
 *
 * One thing this is not: enforcement. The server still sends every snake's
 * cells to everybody, so this hides opponents from the *player*, not from the
 * browser. Making it a real rule means filtering per player in
 * `MultiplayerGame.to_dict()`, where the rest of the rules already live.
 */

import type { Cell, Direction, GameState, MultiplayerState, SnakeView } from "@/types/game";

/**
 * Three radii, and the whole point is that they are three.
 *
 * They used to be two, with the light reaching its darkest at the same distance
 * an opponent vanished. That is what made the spotlight read as a *disc*: the
 * shadow had two cells to climb from nothing to almost black, so it arrived as
 * a ring, and the opponents blinking out on exactly that ring drew a second
 * line on top of the first. Pulling them apart is the fix - a long, slow fade
 * that never coincides with anything else that changes.
 *
 * All three are *distances in cells*. The spotlight itself is a circle measured
 * in pixels; cells only say how wide to make it.
 */

/** Full brightness out to here - barely more than the head itself. */
export const LIGHT_CORE_RADIUS_CELLS = 1;

/** Beyond this an opponent is not drawn at all. Nothing else uses it. */
export const ENEMY_VISIBILITY_RADIUS_CELLS = 5;

/** Where the shadow finally reaches `MAX_VEIL_ALPHA`, and stays there. */
export const VEIL_OUTER_RADIUS_CELLS = 8;

/**
 * The darkest the veil ever gets.
 *
 * Not 1. A board that went absolutely black would lose the walls along with the
 * snakes, and the far side is meant to be unreadable rather than absent.
 */
export const MAX_VEIL_ALPHA = 0.9;

export interface FoggedSnake {
  player_id: string;
  color: number;
  direction: Direction;
  /** Your own snake. Never culled - but not exempt from the dark either. */
  own: boolean;
  /** The cells to draw. An opponent's out-of-range cells are simply absent. */
  cells: Cell[];
  /** The head, when it is drawn. `null` means no eyes are drawn either. */
  head: Cell | null;
  /**
   * The tail and the cell in front of it, both `null` when the fog took them.
   * Not read off the end of `cells`, which is only what survived the cull:
   * rounding that would draw a nose on a cut the fog made. `lib/snakeEnds.ts`
   * turns the pair into a heading - this file says where, that one says what.
   */
  tail: Cell | null;
  beforeTail: Cell | null;
}

export interface FoggedBoard {
  /** Every apple, always. Food is never culled, however far away it is. */
  food: Cell[];
  /** Living snakes only, opponents already cut down to what can be seen. */
  snakes: FoggedSnake[];
}

/**
 * Squared distance between two cells.
 *
 * The cull compares this against a squared radius rather than taking a root:
 * the comparison is then exact in integers, and a float would only round badly
 * right at the boundary. `veilAlphaAt` does need the real distance, because it
 * is placing a cell along a curve rather than answering a yes or no.
 */
function distanceSquared(cell: Cell, focus: Cell): number {
  const dx = cell[0] - focus[0];
  const dy = cell[1] - focus[1];
  return dx * dx + dy * dy;
}

/**
 * The classic smoothstep: zero slope at both ends, steepest in the middle.
 *
 * Both ends are what matter. Flat at 0 means the dark creeps in from the centre
 * instead of starting with a step, and flat at 1 means it settles into its
 * maximum instead of arriving at one - so neither end of the fade leaves a line
 * for the eye to catch.
 */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * How dark the veil is over one cell: 0 inside the core, `MAX_VEIL_ALPHA` at
 * `VEIL_OUTER_RADIUS_CELLS` and everywhere beyond it.
 *
 * The shadow is drawn cell by cell, in squares, like everything else on this
 * board - the light is part of the picture rather than a lens over it. What
 * keeps that from reading as a staircase is the *length* of the fade: seven
 * cells to climb, sampled off a smoothstep, so no two neighbouring rings of
 * cells differ by much.
 */
export function veilAlphaAt(cell: Cell, focus: Cell | null): number {
  if (focus === null) return 0;

  const away = Math.sqrt(distanceSquared(cell, focus));
  const fade = VEIL_OUTER_RADIUS_CELLS - LIGHT_CORE_RADIUS_CELLS;
  const progress = Math.min(1, Math.max(0, (away - LIGHT_CORE_RADIUS_CELLS) / fade));

  return MAX_VEIL_ALPHA * smoothstep(progress);
}

/** Is this cell within `radius` cells of the light? The boundary counts. */
export function isCellVisibleFrom(cell: Cell, focus: Cell, radius: number): boolean {
  return distanceSquared(cell, focus) <= radius * radius;
}

/**
 * Where the light comes from on a shared board: your own head, and only your
 * head. The rest of your snake is lit by it, never a light of its own.
 *
 * **Dying does not lift the light, it freezes it.** `frozen` is where your head
 * was last seen, and it takes over the moment your snake is off the board - so
 * the last thing a round shows you is the patch you died in, and the board you
 * watch out and the board you win on are the same picture. It has to be passed
 * in because a dead snake arrives with no cells at all: the server stops
 * sending a body the moment it stops existing, so nothing in this state says
 * where it was. `hooks/useGameSession.ts` remembers the cell; this file only
 * says what it means.
 *
 * `null` is still the whole board, and it is now only the cases where there is
 * nothing to centre on: the room has not said who we are yet, this connection
 * has no snake in this room, or the player died before a single state arrived.
 */
export function visionFocus(
  snakes: SnakeView[],
  you: string | null,
  frozen: Cell | null = null,
): Cell | null {
  if (you === null) return null;
  const mine = snakes.find((snake) => snake.player_id === you);
  if (!mine || !mine.alive || mine.cells.length === 0) return frozen;
  return mine.cells[0];
}

/**
 * The same, for a solo run - and only while the snake is actually moving.
 *
 * RUNNING is the only state that gets a spotlight. The dark is the difficulty,
 * and difficulty only applies while the game is being played: standing on READY
 * you are still reading the board, PAUSED you have stopped playing, and at
 * GAME_OVER the board is a record of what happened - a record you cannot read
 * is no record. All three hand the whole board back.
 */
export function soloFocus(state: GameState): Cell | null {
  if (state.status !== "running") return null;
  return state.snake[0] ?? null;
}

/**
 * The shared board with the cull already applied: what exists, and nothing
 * about how bright it is.
 *
 * Your own snake comes back whole. That is not an exemption from the dark - the
 * spotlight is laid over it afterwards like everything else, so the far end of
 * a long snake fades out with the ground it is lying on. It only means the fog
 * never *removes* your own cells the way it removes an opponent's.
 *
 * `frozen` is the cell a dead player's light stays on; it culls opponents from
 * there exactly as a living head would, so being out does not hand you the
 * board the players still in it cannot see.
 */
export function applyFog(
  state: MultiplayerState,
  you: string | null,
  frozen: Cell | null = null,
): FoggedBoard {
  const focus = visionFocus(state.snakes, you, frozen);

  const drawn = (cell: Cell, own: boolean): boolean =>
    own || focus === null || isCellVisibleFrom(cell, focus, ENEMY_VISIBILITY_RADIUS_CELLS);

  return {
    food: state.food,
    snakes: state.snakes
      .filter((snake) => snake.alive) // a dead snake is off the board already
      .map((snake) => {
        const own = snake.player_id === you;
        const head = snake.cells[0];
        const tail = snake.cells[snake.cells.length - 1];
        const tailShown = tail !== undefined && drawn(tail, own);

        return {
          player_id: snake.player_id,
          color: snake.color,
          direction: snake.direction,
          own,
          cells: snake.cells.filter((cell) => drawn(cell, own)),
          // The eyes are part of the head, so they follow it exactly: a head
          // outside the radius takes its eyes with it.
          head: head !== undefined && drawn(head, own) ? head : null,
          // Both read off the *whole* snake, before the cull.
          tail: tailShown ? tail : null,
          beforeTail: tailShown ? (snake.cells[snake.cells.length - 2] ?? null) : null,
        };
      }),
  };
}
