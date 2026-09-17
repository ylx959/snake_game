"use client";

/**
 * Everything before a game: the main menu, the solo setup with its leaderboard,
 * and the two ways into a room.
 *
 * The sub-screen is local state and nothing else - it decides which of these
 * four cards is showing and has no bearing on anything the server knows. The
 * moment a command goes up, the server's reply moves the whole session on.
 *
 * Every card here is `tone="ink"`: black with white type, on a ground that is
 * changing colour under it every 5.6s. The interface holds still and the
 * background is what moves - a card that turned over with the ground would put
 * a player's name half typed onto a surface that is a different colour by the
 * time they finish the word. The type standing directly on the ground - the
 * lede and the note - still takes the pair MENU_COLORS measured for that
 * colour; see the `data-theme="pop"` block in globals.css.
 *
 * The home view's heading is the one thing that takes no pair at all: it is the
 * mascot, black and white in every colour the ground turns, watching the
 * pointer. See components/ui/MenuCreature.tsx.
 */

import { useEffect, useState } from "react";

import { LeaderboardTable } from "@/components/screens/LeaderboardTable";
import { CodeField, CODE_LENGTH } from "@/components/ui/CodeField";
import { MenuCreature } from "@/components/ui/MenuCreature";
import { NicknameField } from "@/components/ui/NicknameField";
import { Panel } from "@/components/ui/Panel";
import { cleanNickname, nicknameProblem, rememberNickname, rememberedNickname } from "@/lib/nickname";
import type { ClientMessage, LeaderboardEntry, ServerConfig } from "@/types/game";

type View = "home" | "solo" | "create" | "join";

export function MenuScreen({
  send,
  nickname,
  config,
  leaderboard,
  error,
  dismissError,
}: {
  send: (message: ClientMessage) => void;
  nickname: string | null;
  config: ServerConfig | null;
  leaderboard: LeaderboardEntry[] | null;
  error: string | null;
  dismissError: () => void;
}) {
  const [view, setView] = useState<View>("home");
  const [draft, setDraft] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    // `localStorage` does not exist during the server render, so the remembered
    // name cannot be an initial value without a hydration mismatch - it has to
    // arrive after mount. `current ||` keeps it from overwriting what the
    // player is part way through typing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft((current) => current || nickname || rememberedNickname());
  }, [nickname]);

  // The solo screen leads with the table, so ask for it on the way in.
  useEffect(() => {
    if (view === "solo") send({ type: "get_leaderboard", limit: 100 });
  }, [view, send]);

  const named = nicknameProblem(draft) === null;

  const go = (next: View) => {
    dismissError();
    setView(next);
  };

  /**
   * The cleaned name, remembered for next time.
   *
   * It is not claimed with a message of its own: every screen that needs a name
   * sends it *with* the command it belongs to, so the server settles the name
   * and the command together. A separate `set_nickname` raced against the
   * command that followed it, and a refusal - the name is on the leaderboard,
   * say - arrived too late to stop it.
   *
   * Remembering is local convenience only; the server neither sees nor trusts
   * what is in `localStorage`.
   */
  const claim = () => {
    const nickname = cleanNickname(draft);
    rememberNickname(nickname);
    return nickname;
  };

  if (view === "home") {
    return (
      <div className="screenful screenful--home">
        <h1 className="menu-creature-heading">
          <span className="visually-hidden">Snake</span>
          <MenuCreature />
        </h1>
        {/*
          Everything under the mascot, in one box so it can be sized as one
          thing. The creature is the page and the rest is the caption: this
          block is set at 0.8 of the interface's usual scale and held down away
          from the head, so the two do not read as equals stacked in a column.
        */}
        <div className="home-below">
          <p className="lede">A 90’S RETRO TAKE ON THE CLASSIC SNAKE GAME.</p>
          <div className="controls controls--stack">
            <button type="button" onClick={() => go("solo")}>
              Solo
            </button>
            <button type="button" onClick={() => go("create")}>
              Create room
            </button>
            <button type="button" onClick={() => go("join")}>
              Join room
            </button>
          </div>
          <p className="field__note">Up to {config?.max_players ?? 5} snakes on one board</p>
        </div>
      </div>
    );
  }

  if (view === "solo") {
    return (
      <Panel
        title="Solo"
        size="wide"
        tone="ink"
        footer={
          <>
            <button type="button" onClick={() => go("home")}>
              Back
            </button>
            <button
              type="button"
              disabled={!named}
              onClick={() => send({ type: "solo_enter", nickname: claim() })}
            >
              Play
            </button>
          </>
        }
      >
        <NicknameField value={draft} onChange={setDraft} autoFocus />
        <h2 className="panel__heading">Global top 10</h2>
        <LeaderboardTable entries={leaderboard} />
        {error && <p className="lede lede--bad">{error}</p>}
      </Panel>
    );
  }

  if (view === "create") {
    return (
      <Panel
        title="Create room"
        tone="ink"
        footer={
          <>
            <button type="button" onClick={() => go("home")}>
              Back
            </button>
            <button
              type="button"
              disabled={!named}
              onClick={() => send({ type: "create_room", nickname: claim() })}
            >
              Create
            </button>
          </>
        }
      >
        <NicknameField value={draft} onChange={setDraft} autoFocus />
        <p className="lede">
          The server hands you a {config?.code_length ?? 6}-character code. Share it, and up to{" "}
          {(config?.max_players ?? 5) - 1} others can join.
        </p>
        {error && <p className="lede lede--bad">{error}</p>}
      </Panel>
    );
  }

  return (
    <Panel
      title="Join room"
      tone="ink"
      footer={
        <>
          <button type="button" onClick={() => go("home")}>
            Back
          </button>
          <button
            type="button"
            disabled={!named || code.length !== CODE_LENGTH}
            onClick={() => send({ type: "join_room", code, nickname: claim() })}
          >
            Join
          </button>
        </>
      }
    >
      <CodeField value={code} onChange={setCode} />
      <NicknameField value={draft} onChange={setDraft} />
      {error && <p className="lede lede--bad">{error}</p>}
    </Panel>
  );
}
