"""Six-character room codes, in the shape a player can read out loud.

The alphabet leaves out `O`/`0` and `I`/`1`: a code is meant to be shouted
across a room or typed off a photograph, and those four are the pairs people
get wrong. That leaves 32 symbols and 32**6 - about a billion - codes, so
`RoomManager` finding a free one is a formality rather than a search.

The server generates every code. A client never proposes one.
"""

from __future__ import annotations

import secrets

#: 24 letters (no I, no O) and 8 digits (no 0, no 1).
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6


def generate_code() -> str:
    """A fresh code. `secrets`, not `random`: a guessable code is a way into
    somebody else's room."""
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalise_code(raw: object) -> str | None:
    """Text a player typed to a code, or `None` if it is not one.

    Case and surrounding whitespace are forgiven - people type lower case and
    paste with spaces - but a character outside the alphabet is not, because
    that is the typo the alphabet exists to make impossible.
    """
    if not isinstance(raw, str):
        return None
    code = raw.strip().upper()
    if len(code) != CODE_LENGTH:
        return None
    if any(character not in CODE_ALPHABET for character in code):
        return None
    return code
