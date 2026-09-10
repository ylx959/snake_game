# Rounded Snake Cells Design

## Goal

Give every snake cell a subtle rounded corner while preserving the game's current pixel-grid appearance.

## Rendering

- Draw every snake cell, including the head, with a rounded rectangle.
- Set the corner radius to 8% of the cell's shorter side.
- Keep the existing cell bounds and pixel-snapped edges unchanged.
- Keep the apple rendering unchanged.
- Keep the eye rendering and direction behavior unchanged.

## Text Mask

The white text overlay that appears where the snake passes behind interface text must use the same rounded cell silhouette as the canvas renderer. Its rounded SVG paths must use the same 8% radius and the same pixel-snapped cell bounds so the overlay remains aligned with the painted snake.

## Scope

This is a presentation-only change. It does not alter board geometry, snake movement, collisions, game state, networking, or the apple.

## Verification

- Run the frontend type checker and linter.
- Confirm the snake head and body use the same subtle rounding.
- Confirm the apple is visually unchanged.
- Confirm text changes to white only within the rounded snake silhouette.
