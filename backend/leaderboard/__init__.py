"""The solo high-score table - the one thing on this server that outlives it.

Rooms are in memory because a room is worthless once everyone has gone. A high
score is the opposite: it is the only reason to finish a solo run, so it goes to
a database.
"""

from .repository import (
    LeaderboardEntry,
    LeaderboardRepository,
    SqliteLeaderboardRepository,
    repository_from_env,
)

__all__ = [
    "LeaderboardEntry",
    "LeaderboardRepository",
    "SqliteLeaderboardRepository",
    "repository_from_env",
]
