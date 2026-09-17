"use client";

/**
 * The loading screen.
 *
 * It is waiting for one real thing: the game server's first frame down the
 * WebSocket. There is no progress bar, because there is no progress to report -
 * either the socket has opened and the server has spoken, or it has not. A bar
 * creeping to 90% while nothing is happening would be a lie told in pixels.
 *
 * The fonts and the script are Next's problem and have already resolved by the
 * time this renders; the socket is the only thing outstanding, so the socket is
 * the only thing shown.
 */

import { useEffect, useState } from "react";

import { MenuCreature } from "@/components/ui/MenuCreature";
import type { ConnectionStatus } from "@/types/game";

/** The little snake that runs along under the mascot while we wait. */
const TRACK = 14;
const CRAWL_MS = 110;

function Crawl() {
  const [head, setHead] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setHead((position) => (position + 1) % TRACK), CRAWL_MS);
    return () => clearInterval(timer);
  }, []);

  // Three segments, wrapping - the same body the real game draws, in one line
  // of text cells. It is decoration, so it is hidden from assistive tech.
  const body = new Set([head, (head - 1 + TRACK) % TRACK, (head - 2 + TRACK) % TRACK]);

  return (
    <p className="crawl" aria-hidden="true">
      {Array.from({ length: TRACK }, (_, index) => (
        <span key={index} className="crawl__cell" data-on={body.has(index) ? "" : undefined} />
      ))}
    </p>
  );
}

export function LoadingScreen({
  connection,
  onRetry,
}: {
  connection: ConnectionStatus;
  onRetry: () => void;
}) {
  const failed = connection === "closed";

  return (
    <div className="screenful">
      <h1 className="menu-creature-heading">
        <span className="visually-hidden">Snake</span>
        <MenuCreature />
      </h1>
      <Crawl />
      <p className="lede" role="status">
        {failed ? "Cannot reach the game server" : "Waking the game server"}
      </p>
      {failed ? (
        <div className="controls">
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : (
        <p className="field__note">
          The server owns every rule, so the game starts when it answers
        </p>
      )}
    </div>
  );
}
