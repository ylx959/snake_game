/**
 * Nicknames, client side.
 *
 * The server is the authority - `backend/room/nickname.py` re-checks everything
 * here and the browser cannot skip it - but a rule enforced only across a
 * socket makes the player wait a round trip to find out they typed one
 * character too many. This is the same rule, run early, so the form can say so
 * while they type.
 *
 * A nickname is a label and never an identity: the server tells players apart
 * by a `player_id` the browser never shows and cannot choose.
 */

export const MIN_NICKNAME = 2;
export const MAX_NICKNAME = 12;

const REMEMBERED_KEY = "snake.nickname";

/** Trim, and collapse runs of whitespace - exactly as the server does. */
export function cleanNickname(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Why this name will be refused, or null if it will not be. */
export function nicknameProblem(raw: string): string | null {
  const nickname = cleanNickname(raw);
  if (nickname.length < MIN_NICKNAME) return `At least ${MIN_NICKNAME} characters`;
  if (nickname.length > MAX_NICKNAME) return `At most ${MAX_NICKNAME} characters`;
  return null;
}

/**
 * The last nickname this browser used.
 *
 * A convenience for the input box and nothing more: it is not a login, it does
 * not identify the player to the server, and losing it costs one retype. Every
 * access is guarded - storage throws outright in a private window.
 */
export function rememberedNickname(): string {
  try {
    return localStorage.getItem(REMEMBERED_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberNickname(nickname: string): void {
  try {
    localStorage.setItem(REMEMBERED_KEY, nickname);
  } catch {
    // A browser that refuses storage still plays; it just does not remember.
  }
}
