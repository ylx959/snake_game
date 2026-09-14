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

export function Panel({
  title,
  children,
  footer,
  size = "default",
}: {
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: PanelSize;
}) {
  return (
    <section className="panel" data-size={size}>
      {title && <h1 className="panel__title">{title}</h1>}
      <div className="panel__body">{children}</div>
      {footer && <div className="panel__actions">{footer}</div>}
    </section>
  );
}
