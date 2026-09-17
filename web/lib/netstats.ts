/**
 * How evenly things are happening: a log of the gaps between events, and the
 * shape of that distribution.
 *
 * This exists to answer one question with numbers instead of with a feeling -
 * "is the board uneven because the connection is slow, or because it is
 * *unsteady*, or because frames are being lost?" Those have three different
 * fixes, and they look identical from the sofa.
 *
 * Two things are logged: when a board frame arrived off the socket, and when
 * one was actually painted. The first is the network's beat and the playout
 * buffer cannot change it; the second is the board's beat, and making that one
 * even is the entire point of `lib/playout.ts`. A run where `arrivals` is
 * ragged and `paints` is flat is the buffer doing its job.
 *
 * Pure and framework-free: a caller passes the time in, nothing here reads a
 * clock or touches the DOM.
 */

/** A few seconds at eight frames a second - long enough to see a tail. */
const CAPACITY = 240;

export interface IntervalStats {
  /** How many gaps were measured. */
  count: number;
  mean: number;
  /** The typical gap, and the two that matter for how bad it feels. */
  p50: number;
  p95: number;
  max: number;
  /** Standard deviation: this is the number that says "uneven". */
  jitter: number;
}

/** The gaps between successive events, most recent `CAPACITY` of them. */
export class IntervalLog {
  private gaps: number[] = [];
  private last: number | null = null;

  /** One event happened at `now`. The first one only starts the clock. */
  record(now: number): void {
    if (this.last !== null) {
      this.gaps.push(now - this.last);
      if (this.gaps.length > CAPACITY) this.gaps.shift();
    }
    this.last = now;
  }

  /** `null` until there are at least two events to have a gap between. */
  stats(): IntervalStats | null {
    if (this.gaps.length === 0) return null;

    const sorted = [...this.gaps].sort((a, b) => a - b);
    const count = sorted.length;
    const mean = sorted.reduce((total, gap) => total + gap, 0) / count;
    const variance = sorted.reduce((total, gap) => total + (gap - mean) ** 2, 0) / count;

    return {
      count,
      mean,
      p50: quantile(sorted, 0.5),
      p95: quantile(sorted, 0.95),
      max: sorted[count - 1],
      jitter: Math.sqrt(variance),
    };
  }

  reset(): void {
    this.gaps = [];
    this.last = null;
  }
}

/** Nearest-rank, on an already sorted list. */
function quantile(sorted: number[], fraction: number): number {
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[rank];
}

/**
 * The two logs the app fills in, as one module-level pair.
 *
 * A singleton because the two ends of the measurement are in different files -
 * the socket is in `hooks/useGameSession.ts` and the paint is in
 * `components/game/GameCanvas.tsx` - and threading a diagnostic through the
 * component tree would put it in the app's own plumbing, where it would
 * eventually be mistaken for something the game needs.
 */
export const netLog = {
  arrivals: new IntervalLog(),
  paints: new IntervalLog(),
};

/**
 * Hand the numbers to whoever has the console open: `__net()` in the browser.
 *
 * Deliberately a function on `window` rather than anything on screen. It is for
 * comparing a change against the run before it, not for a player to read, and a
 * readout on the board would be one more thing repainting eight times a second.
 */
export function exposeNetProbe(depth: () => { depth: number; period: number }): () => void {
  const probe = () => ({
    arrivals: netLog.arrivals.stats(),
    paints: netLog.paints.stats(),
    playout: depth(),
  });

  (window as unknown as { __net?: typeof probe }).__net = probe;

  return () => {
    delete (window as unknown as { __net?: typeof probe }).__net;
  };
}
