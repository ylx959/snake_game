"use client";

/**
 * RGB split / chromatic aberration, for one line of display type.
 *
 * The word is drawn three times, once per colour channel, and the copies are
 * composited with `mix-blend-mode: screen`. Screen is additive, so the channels
 * add back to white wherever all three land on the same pixel - the body of
 * every glyph - and only the edges, where one has slid out from under the
 * others, keep a colour. Two channels overlapping give the secondaries, so a
 * fringe runs red or blue through yellow, magenta or cyan on its way to white.
 * That is what a misaligned CRT gun does, which is why it reads as an artefact
 * of the screen rather than as three coloured copies of a word.
 *
 * **The word appears once in the DOM.** The green channel is this element's own
 * text; red and blue are `::before` and `::after` drawing `attr(data-text)`.
 * An earlier version rendered three real spans and marked two `aria-hidden`,
 * and the heading's accessible name came out as "SnakeSnakeSnake" - a name is
 * computed from an element's contents, and that walk is not a reliable place to
 * rely on `aria-hidden`. Generated content cannot be in the DOM text at all, and
 * the `/ ""` in the `content` shorthand is the CSS spec's own way of giving it
 * empty alternative text, so assistive technology skips it too.
 *
 * The effect assumes a **dark ground**: screen over a light background only
 * lightens it, so the fringes would wash out. The solo Game Over score gets one
 * from its card, which is `tone="ink"` for exactly this reason. The menu title
 * no longer does - the menu is one of six flat colours now - so it leans on the
 * black `--emboss` behind it instead: the glyph bodies come back white, and the
 * offset shadow is the edge they read against. See the `data-theme="pop"` block
 * in globals.css. Moving this anywhere else means checking what is behind it.
 *
 * On the menu the split is also *driven*: every time the background changes
 * colour the title is knocked, and `chroma-hit-*` throws the three channels
 * several times their resting distance apart and rattles them back over the
 * same 360ms. Nothing here knows about that - the effect is entirely `--split`,
 * and the animation simply moves it.
 */

export function ChromaticText({
  children,
  className,
}: {
  /** A single line. Deliberately `string`: it also becomes `data-text`. */
  children: string;
  className?: string;
}) {
  return (
    <span className={className ? `chroma ${className}` : "chroma"} data-text={children}>
      {children}
    </span>
  );
}
