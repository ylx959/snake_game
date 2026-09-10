# White Snake Eyes Design

## Goal

Render the snake's eyes in white while leaving every other black element unchanged.

## Design

- Export `WHITE` with the value `#FFFFFF` from `web/lib/palette.ts`.
- Use `WHITE` as the eye fill colour in `web/lib/renderer.ts`.
- Keep the apple on `INK` (`#000000`).
- Keep text, borders, snake colours, eye geometry, and all game behavior unchanged.
- Update the `INK` documentation so it no longer claims that eyes use black.

## Verification

- Run the frontend tests, type checker, and linter.
- Review the renderer diff to confirm that only eye colour changed from `INK` to `WHITE`.
