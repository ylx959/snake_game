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
 * lightens it, so the fringes would wash out. It gets one - the only screens
 * this appears on are black by definition (see the theme block in globals.css).
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
