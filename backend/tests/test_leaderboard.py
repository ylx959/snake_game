"""The solo high-score store.

Every case runs against an in-memory database, so the suite never touches the
development file and never needs cleaning up after itself.
"""

import pytest

from leaderboard.repository import (
    MAX_SCORE,
    MIN_RECORDED_SCORE,
    TOP_LIMIT,
    TOP_VISIBLE,
    SqliteLeaderboardRepository,
    repository_from_env,
)

pytestmark = pytest.mark.leaderboard


@pytest.fixture
def store():
    repository = SqliteLeaderboardRepository(":memory:")
    yield repository
    repository.close()


def test_an_empty_table_reads_back_empty(store):
    assert store.top() == []


def test_a_recorded_run_comes_back(store):
    assert store.record("ylx", 12, achieved_at=100.0) is True
    (entry,) = store.top()
    assert (entry.rank, entry.nickname, entry.score, entry.achieved_at) == (1, "ylx", 12, 100.0)


def test_scores_come_back_highest_first(store):
    for nickname, score in (("low", 1), ("high", 30), ("middle", 10)):
        store.record(nickname, score, achieved_at=100.0)
    assert [e.nickname for e in store.top()] == ["high", "middle", "low"]
    assert [e.rank for e in store.top()] == [1, 2, 3]


def test_a_tie_goes_to_whoever_got_there_first(store):
    store.record("later", 10, achieved_at=200.0)
    store.record("earlier", 10, achieved_at=100.0)
    assert [e.nickname for e in store.top()] == ["earlier", "later"]


def test_the_same_nickname_may_appear_more_than_once(store):
    store.record("ylx", 10, achieved_at=100.0)
    store.record("ylx", 4, achieved_at=200.0)
    assert [e.score for e in store.top()] == [10, 4]


def test_every_run_is_kept_not_just_a_player_best(store):
    # The table is a list of runs. Nothing here is keyed by name, because a
    # nickname is not an identity.
    for index in range(1, 6):
        store.record("ylx", index, achieved_at=100.0 + index)
    assert len(store.top()) == 5


def test_the_table_is_capped_at_a_hundred(store):
    for index in range(TOP_LIMIT + 25):
        store.record(f"P{index:04d}", index, achieved_at=100.0)
    assert len(store.top()) == TOP_LIMIT
    assert store.top()[0].score == TOP_LIMIT + 24


def test_a_smaller_page_can_be_asked_for(store):
    for index in range(20):
        store.record(f"P{index:04d}", index, achieved_at=100.0)
    assert len(store.top(10)) == 10


@pytest.mark.parametrize("limit", [-5, 0])
def test_a_nonsense_limit_yields_nothing_rather_than_everything(store, limit):
    store.record("ylx", 1)
    assert store.top(limit) == []


def test_an_over_large_limit_is_clamped(store):
    for index in range(1, 6):
        store.record(f"P{index}", index)
    assert len(store.top(10_000)) == 5


# --- what will not be stored ---------------------------------------------


@pytest.mark.parametrize("nickname", ["", " ", "a", "a" * 13, None, 42, "fuck"])
def test_a_run_with_an_unusable_name_is_refused(store, nickname):
    assert store.record(nickname, 10) is False
    assert store.top() == []


@pytest.mark.parametrize("score", [-1, MAX_SCORE + 1, "10", 1.5, True, None])
def test_a_score_that_is_not_a_plausible_integer_is_refused(store, score):
    assert store.record("ylx", score) is False
    assert store.top() == []


def test_a_nickname_is_stored_cleaned(store):
    store.record("   ylx   ", 3)
    assert store.top()[0].nickname == "ylx"


def test_a_quote_in_a_nickname_is_stored_literally_not_executed(store):
    # Parameterised statements, so this is a name and not a statement.
    store.record("a'; DROP", 5)
    assert store.top()[0].nickname == "a'; DROP"
    assert store.record("ylx", 1) is True  # the table is still there


def test_a_run_that_ate_nothing_is_not_recorded(store):
    # The commonest way to leave the board, and it says nothing about anyone.
    assert store.record("ylx", 0) is False
    assert store.top() == []


def test_one_apple_is_enough_to_be_recorded(store):
    assert MIN_RECORDED_SCORE == 1
    assert store.record("ylx", 1) is True
    assert store.top()[0].score == 1


def test_clearing_empties_the_table(store):
    store.record("ylx", 5)
    store.clear()
    assert store.top() == []


# --- names that are spoken for -------------------------------------------


def test_an_empty_table_reserves_nothing(store):
    assert store.reserved_nicknames() == set()


def test_the_visible_top_ten_are_reserved(store):
    for index in range(TOP_VISIBLE):
        store.record(f"P{index}", 100 - index, achieved_at=100.0)
    assert store.reserved_nicknames() == {f"p{index}" for index in range(TOP_VISIBLE)}


def test_names_below_the_visible_top_ten_are_not(store):
    for index in range(TOP_VISIBLE):
        store.record(f"P{index}", 100 - index, achieved_at=100.0)
    store.record("Eleventh", 1, achieved_at=100.0)
    assert "eleventh" not in store.reserved_nicknames()


def test_reserved_names_come_back_case_folded(store):
    store.record("MiXeD", 5, achieved_at=100.0)
    assert store.reserved_nicknames() == {"mixed"}


def test_the_visible_top_is_ten(store):
    assert TOP_VISIBLE == 10


# --- configuration --------------------------------------------------------


def test_the_url_decides_the_store():
    repository = repository_from_env("sqlite:///:memory:")
    assert isinstance(repository, SqliteLeaderboardRepository)
    repository.close()


def test_a_file_url_becomes_a_path(tmp_path):
    target = tmp_path / "scores.db"
    repository = repository_from_env(f"sqlite:///{target}")
    repository.record("ylx", 7)
    repository.close()
    assert target.exists()


def test_a_reopened_file_still_has_its_scores(tmp_path):
    target = tmp_path / "scores.db"
    first = repository_from_env(f"sqlite:///{target}")
    first.record("ylx", 7, achieved_at=100.0)
    first.close()

    second = repository_from_env(f"sqlite:///{target}")
    assert [e.score for e in second.top()] == [7]
    second.close()


def test_postgres_is_an_honest_refusal_not_a_silent_sqlite_file():
    with pytest.raises(NotImplementedError):
        repository_from_env("postgresql://user@host/db")


def test_an_unknown_scheme_is_refused():
    with pytest.raises(ValueError):
        repository_from_env("mysql://user@host/db")


def test_an_entry_serialises_to_what_the_browser_expects(store):
    store.record("ylx", 9, achieved_at=100.0)
    assert store.top()[0].to_dict() == {
        "rank": 1,
        "nickname": "ylx",
        "score": 9,
        "achieved_at": 100.0,
    }
