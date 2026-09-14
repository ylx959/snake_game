"use client";

/**
 * The one box every screen outside the board is made of.
 *
 * Menus, lobbies and results are all the same thing as far as the design goes:
 * a black-edged card on the palette background, sized in cells like everything
 * else, so the whole interface still scales by the single factor the board
 * does. Having one component for it is what stops six screens drifting apart.
 */

import type { ReactNode } from "react";

/**
 * How wide the card is allowed to get, in cells. A card is as wide as its
 * *content* needs, never as wide as the screen allows: a score and a ten-row
 * table do not need the width a lobby roster does.
 */
export type PanelSize = "narrow" | "default" | "wide";

/**
 * Which way round the card is.
 *
 * "paper" is the default and follows the screen: white on a solo run, black on
 * the dark screens. "ink" is always black with white type, whatever is behind
 * it - for a card that has to be dark for its contents' sake rather than for
 * the screen's.
 */
export type PanelTone = "paper" | "ink";

export function Panel({
  title,
  children,
  footer,
  size = "default",
  tone = "paper",
}: {
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: PanelSize;
  tone?: PanelTone;
}) {
  return (
    <section className="panel" data-size={size} data-tone={tone}>
      {title && <h1 className="panel__title">{title}</h1>}
      <div className="panel__body">{children}</div>
      {footer && <div className="panel__actions">{footer}</div>}
    </section>
  );
}
