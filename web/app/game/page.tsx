"use client";

/**
 * The game page. Holds the socket session and hands its state down; the
 * server owns every rule, so this component only routes data and commands.
 */

import Link from "next/link";

import { GameCanvas } from "@/components/game/GameCanvas";
import { ScoreBoard } from "@/components/game/ScoreBoard";
import { useSnakeGame } from "@/hooks/useSnakeGame";

export default function GamePage() {
  const { state, connection, send } = useSnakeGame();

  return (
    <main className="page">
      <Link className="page__back" href="/">
        ← Home
      </Link>

      <section className="game">
        <ScoreBoard state={state} connection={connection} />
        <GameCanvas state={state} />

        <footer className="game__controls">
          <button type="button" onClick={() => send({ type: "start" })}>
            Start
          </button>
          <button type="button" onClick={() => send({ type: "pause" })}>
            Pause
          </button>
          <button type="button" onClick={() => send({ type: "reset" })}>
            Reset
          </button>
        </footer>

        <p className="game__hint">Arrows / WASD to steer · Space to pause · R to reset</p>
      </section>
    </main>
  );
}
