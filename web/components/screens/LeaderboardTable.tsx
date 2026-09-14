"use client";

/**
 * The global solo table.
 *
 * Four states, because all four happen: still asking, nothing there yet, the
 * table, and a request that failed. Every value is rendered as text through
 * React, which escapes it - a nickname is a string somebody typed, and it is
 * treated as one all the way down.
 */

import type { LeaderboardEntry } from "@/types/game";

/**
 * `2026.09.14`.
 *
 * The server sends UTC seconds and does not guess at anything; the browser
 * turns them into the player's own calendar day. The *shape* is fixed rather
 * than left to `toLocaleDateString`, which is the obvious call and the wrong
 * one here: its output changes length with the locale - "Sep 14, 2026",
 * "14.9.2026", "2026年9月14日" - and a column of dates that are different
 * widths in a pixel font, in a table already tight for room, reads as noise.
 * Zero-padded and dot-separated, every row is the same ten characters wide and
 * the column lines up on its own.
 */
function when(seconds: number): string {
  const date = new Date(seconds * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  // getMonth() is 0-based; nothing else here is.
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

export function LeaderboardTable({
  entries,
  limit = 10,
  error,
}: {
  entries: LeaderboardEntry[] | null;
  limit?: number;
  error?: string | null;
}) {
  if (error) return <p className="lede lede--bad">{error}</p>;
  if (entries === null) return <p className="lede">Loading scores…</p>;
  if (entries.length === 0) return <p className="lede">No scores yet. Be the first.</p>;

  return (
    <ol className="table">
      {entries.slice(0, limit).map((entry) => (
        <li className="table__row" key={`${entry.rank}-${entry.achieved_at}`}>
          <span className="table__rank">{String(entry.rank).padStart(2, "0")}</span>
          <span className="table__name">{entry.nickname}</span>
          <span className="table__score">{String(entry.score).padStart(3, "0")}</span>
          <span className="table__when">{when(entry.achieved_at)}</span>
        </li>
      ))}
    </ol>
  );
}
