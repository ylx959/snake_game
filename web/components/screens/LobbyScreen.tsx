"use client";

/**
 * The waiting room.
 *
 * Everything on it is the server's: the code, the roster, who the host is, how
 * many are in. The Start button is shown to everybody and refused by the server
 * for anyone but the host - the browser disables it as a courtesy, not as the
 * rule.
 */

import { Panel } from "@/components/ui/Panel";
import { playerColorAt } from "@/lib/palette";
import type { ClientMessage, LobbyState } from "@/types/game";

export function LobbyScreen({
  lobby,
  you,
  send,
  error,
}: {
  lobby: LobbyState;
  you: string | null;
  send: (message: ClientMessage) => void;
  error: string | null;
}) {
  const host = lobby.host_id === you;
  const enough = lobby.count >= lobby.min_players;
  const me = lobby.players.find((player) => player.player_id === you);

  return (
    <Panel
      title="Lobby"
      size="wide"
      footer={
        <>
          <button type="button" onClick={() => send({ type: "leave_room" })}>
            Leave
          </button>
          <button
            type="button"
            onClick={() => send({ type: "ready", ready: !me?.ready })}
          >
            {me?.ready ? "Not ready" : "Ready"}
          </button>
          <button
            type="button"
            disabled={!host || !enough}
            onClick={() => send({ type: "start_room" })}
          >
            Start
          </button>
        </>
      }
    >
      <p className="code" aria-label={`Room code ${lobby.code.split("").join(" ")}`}>
        {lobby.code}
      </p>
      <p className="lede">
        {lobby.count}/{lobby.capacity} in the room
      </p>

      <ul className="roster">
        {lobby.players.map((player) => (
          <li className="roster__row" key={player.player_id}>
            <span
              className="swatch"
              style={{ background: playerColorAt(player.color) }}
              aria-hidden="true"
            />
            <span className="roster__name">
              {player.nickname}
              {player.player_id === you && <span className="badge">You</span>}
              {player.host && <span className="badge">Host</span>}
            </span>
            <span className="roster__state">{player.ready ? "Ready" : "Waiting"}</span>
          </li>
        ))}
      </ul>

      {error && <p className="lede lede--bad">{error}</p>}
      <p className="field__note">
        {host
          ? enough
            ? "You are the host. Start when everyone is in."
            : `Need at least ${lobby.min_players} players`
          : "Waiting for the host to start"}
      </p>
    </Panel>
  );
}
