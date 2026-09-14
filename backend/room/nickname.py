"""One-off display names.

A nickname is a label, never an identity. The server tells players apart by
`player_id` (see `room.session`), which the client never sees and cannot choose,
so a name that collides, changes or lies costs nothing but confusion.

Validation is therefore about legibility rather than security: something a
person can read in a lobby, that cannot smuggle formatting into the page around
it, and that is not obviously offensive.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

MIN_NICKNAME = 2
MAX_NICKNAME = 12

#: Runs of any whitespace become one plain space.
_WHITESPACE = re.compile(r"\s+")

#: A deliberately small, obvious list. This is a filter for the worst of it, not
#: a moderation system - a determined player will always get something past it,
#: and a longer list starts refusing ordinary names (the Scunthorpe problem).
_BLOCKED = (
    "fuck",
    "shit",
    "cunt",
    "bitch",
    "nigger",
    "faggot",
    "rape",
)


@dataclass(frozen=True)
class CleanNickname:
    """Either a usable name or the reason there isn't one. Never both."""

    nickname: str | None
    error: str | None


def _is_printable(text: str) -> bool:
    """Reject anything that is not a character you can see and click past.

    Unicode categories starting `C` are control, format and unassigned
    characters. That covers NUL, and it covers the bidirectional overrides -
    U+202E and friends - which would otherwise let a nickname reverse the text
    printed after it in the lobby.
    """
    return all(not unicodedata.category(character).startswith("C") for character in text)


def clean_nickname(raw: object) -> CleanNickname:
    """Text off a socket to a display name, or a reason it was refused.

    Never raises: a bad name is an expected case, and the caller turns the
    error code straight into a message for the player.
    """
    if not isinstance(raw, str):
        return CleanNickname(None, "nickname_invalid")

    nickname = _WHITESPACE.sub(" ", raw).strip()

    if not nickname or not _is_printable(nickname):
        return CleanNickname(None, "nickname_invalid")
    if len(nickname) < MIN_NICKNAME:
        return CleanNickname(None, "nickname_too_short")
    if len(nickname) > MAX_NICKNAME:
        return CleanNickname(None, "nickname_too_long")

    # Compare with the spacing and punctuation taken out, so "F U C K" is
    # caught along with "fuck".
    flattened = "".join(character for character in nickname.lower() if character.isalnum())
    if any(word in flattened for word in _BLOCKED):
        return CleanNickname(None, "nickname_blocked")

    return CleanNickname(nickname, None)
