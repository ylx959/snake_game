/**
 * Canvas renderer. Stateless with respect to the game: it is handed a view of
 * server state and draws exactly that, so it can never disagree with the
 * server.
 *
 * It draws the board and nothing else. Every piece of text - score, status,
 * prompts, buttons, the hint, the player list - is DOM, so the pixel font is a
 * font rather than something this file has to reimplement with `fillText`.
 */

import { cellEdges } from "@/lib/board";
import { INK, inkOn, paletteAt, playerColorAt, roomBackgroundAt } from "@/lib/palette";
import {
  type FoggedBoard,
  applyFog,
  smoothstep,
  soloFocus,
  veilAlphaAt,
  visionFocus,
} from "@/lib/vision";
import type { Cell, Direction, GameState, MultiplayerState } from "@/types/game";

/**
 * What the canvas is being asked to draw. One board, two shapes of state: solo
 * has a single snake the server already knows everything about, a room has
 * several and a "which one is mine".
 *
 * A room carries `you` because the board is not the same for everybody: the fog
 * in `lib/vision.ts` is measured from your own head, so "which snake is mine"
 * decides what gets drawn and not only what gets a name tag.
 */
export type BoardView =
  | { mode: "solo"; state: GameState }
  | { mode: "group"; state: MultiplayerState; you: string | null };

/**
 * The head's eyes: two fully rounded bars that run along the way the snake is
 * heading, pushed toward the leading edge of the cell.
 *
 * The numbers are the reference drawing measured on a 54x54 cell, kept as
 * fractions of it so they scale with any cell size: each bar is 25 long and 13
 * thick, its long axis centred at 36.5, and the pair sitting 11.5 either side
 * of the middle.
 */
const EYE_LENGTH = 25 / 54;
const EYE_THICKNESS = 13 / 54;
/** Distance from the trailing edge to the bars' long-axis centre. */
const EYE_AHEAD = 36.5 / 54;
/** How far each bar sits from the cell's centre line. */
const EYE_SPREAD = 11.5 / 54;

/**
 * Which way the bars lie, and how far along that axis they sit. UP and LEFT
 * lead toward the low end of their axis, so their pair mirrors.
 */
const EYES: Record<Direction, { horizontal: boolean; ahead: number }> = {
  RIGHT: { horizontal: true, ahead: EYE_AHEAD },
  LEFT: { horizontal: true, ahead: 1 - EYE_AHEAD },
  DOWN: { horizontal: false, ahead: EYE_AHEAD },
  UP: { horizontal: false, ahead: 1 - EYE_AHEAD },
};

/** Below this the eyes are a smudge, so they are dropped instead. */
const MIN_CELL_FOR_EYES = 10;

/** How far the apple is inset, so it reads as an object and not a wall tile. */
const FOOD_INSET = 0.14;

/**
 * The halo behind an apple: a soft circle, a little under one cell across.
 *
 * Just enough to lift a black apple off a dark board. Anything brighter or
 * wider stops reading as "there is an apple here" and starts reading as a
 * second light source, which would undo the point of having one.
 */
const HALO_RADIUS_CELLS = 0.75;
const HALO_ALPHA = 0.8;
const HALO_STEPS = 8;

/** `#00D6F0` -> `0, 214, 240`, so a gradient can vary that colour's alpha. */
function channels(hex: string): string {
  const packed = Number.parseInt(hex.slice(1), 16);
  return `${(packed >> 16) & 255}, ${(packed >> 8) & 255}, ${packed & 255}`;
}

/** The cells of every snake in a view, for the DOM text mask to clip against. */
export function litCells(view: BoardView | null): Cell[] {
  if (!view) return [];
  if (view.mode === "solo") return view.state.snake;
  // Only what is actually painted. An opponent the fog is hiding must not light
  // the readouts either, or the text would say where they are.
  return applyFog(view.state, view.you).snakes.flatMap((snake) => snake.cells);
}

/** The board's shape, in cells. */
export function boardShape(view: BoardView | null): { cols: number; rows: number } | null {
  if (!view) return null;
  return { cols: view.state.width, rows: view.state.height };
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cellWidth = 0;
  private cellHeight = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  /**
   * Point the backing store at a box of this size.
   *
   * It does **not** touch `style.width` / `style.height`. CSS lays the canvas
   * out (it fills the stage), and an inline size written here would override
   * that rule and pin the element at whatever it measured first - the board
   * would then stay that size for ever while the window shrank around it.
   * The element's size is CSS's; only the pixel buffer is this class's.
   */
  resize(cols: number, rows: number, boxWidth: number, boxHeight: number): void {
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.round(boxWidth * dpr);
    this.canvas.height = Math.round(boxHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;

    this.cellWidth = boxWidth / cols;
    this.cellHeight = boxHeight / rows;
  }

  /**
   * Wipe the board.
   *
   * A canvas keeps its last frame for ever unless something says otherwise, so
   * leaving a round for the menu left the room's snakes sitting behind the
   * menu - and then stretched, because the stage changes shape between the two
   * board sizes while the backing store still held the old picture.
   *
   * The transform is reset first: `draw` leaves a device-pixel-ratio scale on
   * the context, and clearing `canvas.width` x `canvas.height` through that
   * scale would wipe only the top-left corner on any display where the ratio
   * is not 1.
   */
  clear(): void {
    const { ctx, canvas } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  draw(view: BoardView): void {
    const { ctx } = this;
    const { state } = view;

    // Both boards cycle a background on a server-sent index; what advances it
    // differs - solo on every apple, a room on every death (see
    // `MultiplayerGame.tick`) - and so does the list they draw from. A room's
    // is deep and kept clear of all five player colours, because there the
    // background has to sit under snakes whose colours cannot move out of its
    // way. See `ROOM_BACKGROUNDS`.
    const ground =
      view.mode === "solo" ? paletteAt(state.palette).bg : roomBackgroundAt(state.palette);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, state.width * this.cellWidth, state.height * this.cellHeight);

    // The veil goes straight onto the bare ground, before a single apple or
    // snake is drawn on it. It is the dark the board is *seen through*, not a
    // filter laid over the pieces - which is what lets a room's veil be fully
    // opaque without breaking either of the two promises made about it: the
    // apples stay completely visible, and your own snake is never cut down.
    // The board is drawn whole first - every snake, every eye - and only then
    // put into shadow. That order is the whole effect: the spotlight is one
    // smooth circle laid over a finished picture, so your own snake fades out
    // along its length instead of being exempt from the dark it lies in.
    //
    // The apples are the one thing painted back on top of the shadow, which is
    // what makes "food is never hidden" true at any distance.
    if (view.mode === "solo") {
      this.drawSolo(view.state);
      this.drawVeil(state.width, state.height, soloFocus(view.state));
      // Black, on every palette, exactly as it always has been.
      if (view.state.food) this.drawFood(view.state.food, ground, INK);
    } else {
      const board = applyFog(view.state, view.you);
      this.drawGroup(board);
      this.drawVeil(state.width, state.height, visionFocus(view.state.snakes, view.you));
      // A room's grounds are deep, so the apple inverts with them. Asked rather
      // than hard-coded, so a retuned background cannot leave a black apple on
      // a black board - `test/palette.test.mjs` pins that they all stay dark.
      for (const cell of board.food) this.drawFood(cell, ground, inkOn(ground));
    }
  }

  /**
   * The spotlight: the board darkened everywhere the head is not, cell by cell.
   *
   * Squares, not a gradient. Every other thing on this board lands on the cell
   * grid - the snake, the apple, the walls - and the light is part of the
   * picture rather than a lens laid over it, so it is drawn the same way.
   *
   * What stops that reading as a staircase is the *length* of the fade rather
   * than the smoothness of its edge. It starts one cell from the head and takes
   * seven more to reach full dark, sampled off a smoothstep, so neighbouring
   * rings of cells differ by a few percent and the steps disappear into the
   * pixel art instead of drawing a ring around it. The short version - three
   * cells to five - is what made the old light read as a disc.
   *
   * Everything is measured from `cellWidth`/`cellHeight`, so a resized board
   * re-derives the centre and the radius rather than carrying either across.
   *
   * `focus` of `null` draws nothing at all - a finished solo run and a
   * spectator both keep their whole board.
   */
  private drawVeil(cols: number, rows: number, focus: Cell | null): void {
    if (focus === null) return;

    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = INK;

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const shadow = veilAlphaAt([x, y], focus);
        if (shadow <= 0) continue; // inside the core: nothing to lay over it

        const [left, top, width, height] = this.bounds([x, y]);
        ctx.globalAlpha = shadow;
        ctx.fillRect(left, top, width, height);
      }
    }

    // `restore` puts back `globalAlpha` and `fillStyle` together, so neither
    // leaks into the apples drawn next.
    ctx.restore();
  }

  // --- solo ---------------------------------------------------------------

  /** The snake and its eyes. The apple comes later, on top of the shadow. */
  private drawSolo(state: GameState): void {
    const { fg } = paletteAt(state.palette);

    for (const cell of state.snake) this.fillCell(cell, fg);
    if (state.snake.length > 0) this.drawEyes(state.snake[0], state.direction);
  }

  // --- a shared board ----------------------------------------------------

  /**
   * Every snake that exists, then every visible head's eyes.
   *
   * Nothing here dims anything. The fog has already removed the opponent cells
   * that are too far away, and the shadow that follows makes the rest darker
   * the further it lies from your head - including your own tail. Dimming a
   * distant opponent here as well would darken it twice over.
   *
   * The segment is exactly the one solo draws: the same hard square, the same
   * black eyes. Only the fill differs, and only because five snakes have to be
   * told apart. A shared board is meant to look like the game, not like a
   * different one.
   *
   * Bodies first, then the eyes, so a head another snake is drawn over still
   * shows which way it was looking.
   */
  private drawGroup(board: FoggedBoard): void {
    for (const snake of board.snakes) {
      const color = playerColorAt(snake.color);
      for (const cell of snake.cells) this.fillCell(cell, color);
    }

    for (const snake of board.snakes) {
      // `head` is null when the head cell was culled: the eyes go with it,
      // rather than floating where a snake is not drawn.
      if (snake.head) this.drawEyes(snake.head, snake.direction);
    }
  }

  // --- pieces -------------------------------------------------------------

  /**
   * An apple: a soft round halo, then the apple itself.
   *
   * Drawn after the shadow, and the apple is black, so something has to lift it
   * off the dark. Re-laying its whole cell in the ground colour did that and
   * was wrong - a square of daylight in the dark, with corners, reading as a
   * tile rather than as fruit. The halo is a circle that fades out well inside
   * the cell, so there is no edge anywhere to see.
   *
   * It is deliberately dim. Its job is to make the apple findable, not to be a
   * second spotlight; inside the light it is the colour already there and shows
   * as nothing at all.
   *
   * The apple keeps its own hard pixel square on top - the halo is light, the
   * fruit is still drawn the way every other object on this board is.
   */
  private drawFood(cell: Cell, ground: string, fruit: string): void {
    const { ctx } = this;
    const [left, top, width, height] = this.bounds(cell);
    const centreX = left + width / 2;
    const centreY = top + height / 2;
    const radius = Math.min(this.cellWidth, this.cellHeight) * HALO_RADIUS_CELLS;
    const rgb = channels(ground);

    ctx.save();

    const halo = ctx.createRadialGradient(centreX, centreY, 0, centreX, centreY, radius);
    for (let index = 0; index <= HALO_STEPS; index += 1) {
      const position = index / HALO_STEPS;
      halo.addColorStop(position, `rgba(${rgb}, ${HALO_ALPHA * (1 - smoothstep(position))})`);
    }

    // An arc rather than the cell's rectangle: the gradient ends transparent,
    // but filling a square with it would still be a square of work, and the
    // shape being circular is the whole reason this replaced the patch.
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    this.fillCell(cell, fruit, FOOD_INSET);
  }

  /** Two black bars on the head, so you can tell which end is which. */
  private drawEyes(head: Cell, direction: Direction): void {
    const { ctx } = this;
    const [left, top, width, height] = this.bounds(head);
    if (Math.min(width, height) < MIN_CELL_FOR_EYES) return;

    const { horizontal, ahead } = EYES[direction];
    const along = horizontal ? width : height;
    const across = horizontal ? height : width;

    // Whole pixels, so the straight sides stay hard; only the rounded caps are
    // ever antialiased.
    const barAlong = Math.max(2, Math.round(EYE_LENGTH * along));
    const barAcross = Math.max(2, Math.round(EYE_THICKNESS * across));
    const alongPos = Math.round(ahead * along - barAlong / 2);

    // Place the near bar, then mirror it. Rounding each bar independently lets
    // one round up and the other down, which lands the pair a pixel off centre.
    const near = Math.round((0.5 - EYE_SPREAD) * across - barAcross / 2);
    const far = across - barAcross - near;

    ctx.fillStyle = INK;
    for (const acrossPos of [near, far]) {
      const x = left + (horizontal ? alongPos : acrossPos);
      const y = top + (horizontal ? acrossPos : alongPos);
      const w = horizontal ? barAlong : barAcross;
      const h = horizontal ? barAcross : barAlong;

      ctx.beginPath();
      // A radius of half the short side turns the rectangle into a capsule.
      ctx.roundRect(x, y, w, h, Math.min(w, h) / 2);
      ctx.fill();
    }
  }

  /**
   * One cell, filled. A snake segment takes the whole cell (`inset` 0); the
   * apple is inset so it reads as an object rather than a wall tile.
   *
   * `fillRect` with no rounding anywhere: the edges `bounds()` hands back are
   * whole pixels and neighbours share them exactly, so segments tile with no
   * seam and nothing on the snake is ever antialiased.
   *
   * Never translucent. Distance is the spotlight's job, laid over the finished
   * board; a cell drawn here is drawn at full strength.
   */
  private fillCell(cell: Cell, color: string, inset = 0): void {
    const [left, top, width, height] = this.bounds(cell);
    const padX = Math.round(width * inset);
    const padY = Math.round(height * inset);

    this.ctx.fillStyle = color;
    this.ctx.fillRect(left + padX, top + padY, width - padX * 2, height - padY * 2);
  }

  /**
   * A cell's pixel rectangle, snapped to whole pixels on every edge.
   *
   * The rule lives in `lib/board.ts` because the DOM needs the same answer:
   * `LitText` masks itself with these rectangles, and a mask that rounds even
   * one edge differently from the paint would sit visibly off the snake.
   */
  private bounds([x, y]: Cell): [number, number, number, number] {
    const [left, width] = cellEdges(x, this.cellWidth);
    const [top, height] = cellEdges(y, this.cellHeight);
    return [left, top, width, height];
  }
}
