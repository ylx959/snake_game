/**
 * The playout buffer: what turns "draw whenever a frame arrived" into "draw one
 * frame every period".
 *
 * The board is drawn by the server's clock, one cell of movement per tick. The
 * browser used to repaint the moment a `game_state` landed, which made the
 * *network's* jitter the board's timing: two frames 90ms apart and the next
 * 150ms, and a snake that visibly hurries and hesitates. The round trip is not
 * what that is - a steady 60ms delay is something a player stops noticing
 * within seconds. An unsteady one never becomes invisible.
 *
 * So frames are held for a moment and let out on an even beat. Nothing is
 * interpolated: a snake still stands exactly on the grid, on whole pixels, and
 * the picture is byte-for-byte the one this file did not exist to change. Only
 * *when* each frame is shown is decided here.
 *
 * Pure, and takes `now` from its caller rather than reading a clock, so the
 * whole schedule is testable without timers - like everything else in `lib/`.
 */

/**
 * How long a frame is held before it is shown, and therefore how much jitter
 * can be swallowed without the board stalling.
 *
 * Two thirds of a tick. Big enough to cover the jitter of an ordinary
 * connection, small enough that it costs less than one server tick of delay -
 * and the cost is real: this is added to the time between your key press and
 * the turn you see, on top of the round trip. Raising it buys smoothness with
 * exactly that.
 */
export const BUFFER_MS = 80;

/** Until enough frames have arrived to measure the server's beat. */
export const DEFAULT_PERIOD_MS = 120;

/** Intervals outside this are not the beat: a stall, a burst, a tab waking. */
const MIN_PERIOD_MS = 40;
const MAX_PERIOD_MS = 400;

/** How many arrival intervals the period is measured over - a few seconds. */
const SAMPLE_SIZE = 24;

/** Below this many samples the measurement is not worth trusting yet. */
const MIN_SAMPLES = 8;

/**
 * Depth is how far behind we are, so it is what the beat speeds up for.
 *
 * A queue standing at one frame is the buffer doing its job. Two or more means
 * the wait is now costing real delay - a burst after a stall, a backgrounded
 * tab handing back a second of frames at once, or the server's own reply to a
 * command arriving between two ticks - so the beat quickens rather than
 * playing a backlog out at its leisure. Past `RUSH_DEPTH` it stops waiting
 * altogether: catching up in one frame reads as a jump, where staying a third
 * of a second behind for ever reads as a bad connection.
 */
const HURRY_DEPTH = 2;
const HURRY_RATE = 0.6;
const RUSH_DEPTH = 4;

/**
 * Past this many frames the queue is not a backlog, it is history.
 *
 * A hidden tab gets no animation frames at all, so nothing drains the queue
 * while the messages keep coming: a minute in another window is four hundred
 * frames of a game that has long since moved on. They are dropped down to the
 * newest one, which is not a loss of anything - every frame is a *complete*
 * board, so the last one is the whole truth and the rest are where the snake
 * used to be. Playing them back, even at speed, would be a minute of somebody
 * else's round before the present arrived.
 */
const MAX_QUEUE = 12;

/**
 * A queue of frames and the schedule they come out on.
 *
 * `T` is only ever a server message here; the buffer never looks inside one,
 * which is what keeps "what a message means" in the reducer where it belongs.
 */
export class Playout<T> {
  private queue: T[] = [];
  private intervals: number[] = [];
  private lastArrival: number | null = null;
  /**
   * When the next frame is due - an absolute time, not a countdown, and kept
   * whether or not there is a frame to put in it.
   *
   * That is the part that does the work. A slot that survived an empty queue is
   * a beat the board keeps through a late frame: the frame goes out when its
   * own slot comes round rather than the instant it lands, so one frame's delay
   * is not passed on to the one behind it. Re-arming the schedule every time
   * the queue emptied would hand the jitter straight back, because in a healthy
   * round the queue empties on every single frame.
   *
   * `null` only between runs, which is what gives the next frame a fresh
   * cushion instead of a slot inherited from a round that is over.
   */
  private nextSlot: number | null = null;

  /** A frame off the socket, with the moment it landed. */
  push(frame: T, now: number): void {
    if (this.lastArrival !== null) {
      const gap = now - this.lastArrival;
      // Only a plausible beat is measured. A stall's 900ms and a burst's 2ms
      // are both real arrivals and neither is the period.
      if (gap >= MIN_PERIOD_MS && gap <= MAX_PERIOD_MS) {
        this.intervals.push(gap);
        if (this.intervals.length > SAMPLE_SIZE) this.intervals.shift();
      }
    }
    this.lastArrival = now;

    this.queue.push(frame);

    // Too far behind to catch up: keep the present and start again from it,
    // cushion and all. See `MAX_QUEUE`.
    if (this.queue.length > MAX_QUEUE) {
      this.queue = [frame];
      this.nextSlot = now + BUFFER_MS;
      return;
    }

    // The first frame of a run sets the beat going, one buffer from now.
    if (this.nextSlot === null) this.nextSlot = now + BUFFER_MS;
  }

  /**
   * The frames that are due, oldest first - normally none or one.
   *
   * Several only when the buffer is catching up, and the caller applies them in
   * order, so the last one is what ends up on screen.
   */
  due(now: number): T[] {
    const ready: T[] = [];

    while (this.queue.length > 0 && this.nextSlot !== null && now >= this.nextSlot) {
      ready.push(this.queue.shift() as T);

      // How late this frame was for its slot. A few milliseconds is the
      // display clock's own granularity, and the beat carries on from where it
      // was - the schedule is absolute, so those milliseconds cannot add up
      // into a drift. More than a whole period is a stall: the frame never came
      // while its slot was open, the beat is already broken, and the cushion
      // has been eaten. That one is rebuilt from here, which costs one longer
      // gap rather than leaving the rest of the round with no slack at all.
      const late = now - this.nextSlot;
      this.nextSlot = (late > this.period ? now + BUFFER_MS : this.nextSlot) + this.wait();
    }

    return ready;
  }

  /**
   * Everything still waiting, at once, and the schedule torn down.
   *
   * This is what any message that is *not* a board frame does first, so the
   * order a socket delivered things in is the order the screen sees them: a
   * `results` cannot overtake the last tick of the round it is reporting, and
   * leaving a room cannot be undone by a frame that was still in the queue.
   */
  flush(): T[] {
    const pending = this.queue;
    this.queue = [];
    this.nextSlot = null;
    return pending;
  }

  /** A new round, a new socket: drop the lot, including the measurement. */
  reset(): void {
    this.queue = [];
    this.nextSlot = null;
    this.lastArrival = null;
    this.intervals = [];
  }

  /**
   * The measured beat, or the default until there is enough to measure.
   *
   * The **mean** of the kept gaps, and it has to be the mean: jitter moves an
   * arrival earlier or later, so it lands in two consecutive gaps with opposite
   * signs and cancels in a sum. Twenty-four gaps average to the true period
   * within a couple of milliseconds however ragged each one was. A median of
   * the same samples is a much worse estimate - the middle of a spread that
   * wide is wherever a handful of samples happened to fall, and thirty
   * milliseconds out is enough to make the board slowly outrun the server or
   * fall behind it.
   *
   * The implausible gaps are already gone (`push`), so a stall's second cannot
   * drag the average up. Dropping them costs nothing: it is the terms either
   * side of the missing one that have to cancel, and they still do.
   */
  get period(): number {
    if (this.intervals.length < MIN_SAMPLES) return DEFAULT_PERIOD_MS;
    return this.intervals.reduce((total, gap) => total + gap, 0) / this.intervals.length;
  }

  /** How many frames are waiting. Diagnostics, and the hurry rule above. */
  get depth(): number {
    return this.queue.length;
  }

  /** How long to wait before the next frame, given how far behind we are. */
  private wait(): number {
    if (this.queue.length >= RUSH_DEPTH) return 0;
    if (this.queue.length >= HURRY_DEPTH) return this.period * HURRY_RATE;
    return this.period;
  }
}
