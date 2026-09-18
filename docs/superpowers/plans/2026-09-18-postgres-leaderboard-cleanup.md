# PostgreSQL Leaderboard Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Supabase/PostgreSQL leaderboard change by replacing the obsolete refusal test, putting the repository module in a readable order, and synchronizing every stale project document with the implemented behavior.

**Architecture:** Keep `LeaderboardRepository` as the application boundary and retain both concrete stores: SQLite for local development and isolated tests, PostgreSQL through `psycopg_pool.ConnectionPool` for deployed persistence. `repository_from_env()` remains the only selection point. This cleanup deliberately avoids extracting a base class or shared validation helpers because two small implementations do not justify another abstraction.

**Tech Stack:** Python 3.11+, FastAPI, SQLite, PostgreSQL/Supabase, Psycopg 3.3.5, psycopg-pool, pytest 8.4.2

## Global Constraints

- Preserve `SqliteLeaderboardRepository`; it remains the default local store and the test store.
- Preserve `_migrate_to_one_row_per_player()` so existing local SQLite files remain compatible.
- Preserve `clear()` in the protocol and both implementations; tests rely on it even though the live game path does not call it.
- Do not place a real Supabase URL, database password, host, project reference, or credential in source, tests, docs, commands committed to Git, or test output.
- Do not connect to the network from unit tests.
- PostgreSQL selection must be tested by replacing the constructor with a local stub via `monkeypatch`.
- Keep the PostgreSQL implementation private to `leaderboard.repository`; callers continue to use `repository_from_env()` and the `LeaderboardRepository` protocol.
- Do not change game rules, WebSocket messages, ranking order, nickname normalization, score validation, or database schema.
- Preserve the current dependency pin `psycopg[binary,pool]==3.3.5`.
- Run backend tests from `backend/` so `backend/pyproject.toml` registers the project markers.

---

## File Structure

- Modify `backend/tests/test_leaderboard.py`: replace the obsolete PostgreSQL-refusal test with a network-free factory-dispatch test.
- Modify `backend/leaderboard/repository.py`: place both concrete repositories before the factory and correct stale module/factory documentation.
- Modify `backend/.env.example`: document PostgreSQL as supported while keeping SQLite as the safe local default.
- Modify `README.md`: list Psycopg/PostgreSQL, correct the dependency count, document both stores, and update the repository tree description.
- Modify `education.md`: describe SQLite as the local implementation and PostgreSQL as the deployed implementation.
- Modify `CLAUDE.md`: update the backend dependency description without changing architecture guidance.

No frontend, protocol, game, room, transport, schema, or deployment configuration file changes.

---

### Task 1: Replace the obsolete PostgreSQL refusal test

**Files:**
- Modify: `backend/tests/test_leaderboard.py:1-18,247-282`
- Test: `backend/tests/test_leaderboard.py`

**Interfaces:**
- Consumes: `repository_from_env(url: str | None = None) -> LeaderboardRepository` and the module attribute `PostgresLeaderboardRepository`.
- Produces: a unit test proving that both `postgres://` and `postgresql://` URLs select the PostgreSQL constructor without opening a database connection.

- [ ] **Step 1: Reproduce the stale test failure**

Run:

```bash
cd /Users/yanglinxuan/Documents/snake_game/backend
.venv/bin/python -m pytest tests/test_leaderboard.py::test_postgres_is_an_honest_refusal_not_a_silent_sqlite_file -v
```

Expected: FAIL after the fake host cannot be resolved or the pool times out, demonstrating that the test still asserts the removed `NotImplementedError` behavior.

- [ ] **Step 2: Import the repository module for constructor replacement**

Add this import immediately after `import pytest`:

```python
import leaderboard.repository as repository_module
```

Keep the existing named imports because the rest of the test file uses them.

- [ ] **Step 3: Replace the obsolete test with a network-free dispatch test**

Delete:

```python
def test_postgres_is_an_honest_refusal_not_a_silent_sqlite_file():
    with pytest.raises(NotImplementedError):
        repository_from_env("postgresql://user@host/db")
```

Insert:

```python
@pytest.mark.parametrize("scheme", ["postgres", "postgresql"])
def test_a_postgres_url_selects_the_postgres_store_without_connecting(monkeypatch, scheme):
    constructed = []

    class StubPostgresLeaderboardRepository:
        def __init__(self, url):
            self.url = url
            constructed.append(self)

    monkeypatch.setattr(
        repository_module,
        "PostgresLeaderboardRepository",
        StubPostgresLeaderboardRepository,
    )
    url = f"{scheme}://user@host/db"

    repository = repository_module.repository_from_env(url)

    assert repository is constructed[0]
    assert repository.url == url
```

This test checks only URL dispatch. It must not instantiate the real connection pool.

- [ ] **Step 4: Run the focused configuration tests**

Run:

```bash
cd /Users/yanglinxuan/Documents/snake_game/backend
.venv/bin/python -m pytest tests/test_leaderboard.py -k "url or scheme" -v
```

Expected: the SQLite URL test, both PostgreSQL scheme cases, and the unknown-scheme test PASS with no DNS warning and no ten-second delay.

- [ ] **Step 5: Run the complete leaderboard test module**

Run:

```bash
cd /Users/yanglinxuan/Documents/snake_game/backend
.venv/bin/python -m pytest tests/test_leaderboard.py -v
```

Expected: all leaderboard tests PASS.

- [ ] **Step 6: Commit the test correction**

```bash
git add backend/tests/test_leaderboard.py
git commit -m "test: cover PostgreSQL repository dispatch"
```

---

### Task 2: Put the repository module in dependency order and remove stale commentary

**Files:**
- Modify: `backend/leaderboard/repository.py:1-433`
- Test: `backend/tests/test_leaderboard.py`

**Interfaces:**
- Consumes: the existing `LeaderboardRepository` protocol and both existing concrete repository classes.
- Produces: unchanged runtime APIs with the source ordered as shared types/helpers, SQLite implementation, PostgreSQL implementation, then environment factory.

- [ ] **Step 1: Correct the module-level protocol description**

Change:

```python
depends on the four methods in the Protocol below and on nothing
```

to:

```python
depends on the five methods in the Protocol below and on nothing
```

The protocol currently contains `record`, `top`, `reserved_nicknames`, `clear`, and `close`.

- [ ] **Step 2: Move the PostgreSQL class above the environment factory without editing its behavior**

Move the exact existing block beginning with:

```python
class PostgresLeaderboardRepository:
```

and ending with the existing `_pool.close()` statement so that it appears immediately after `SqliteLeaderboardRepository.close()` and immediately before:

```python
def repository_from_env(url: str | None = None) -> LeaderboardRepository:
```

The resulting top-level order must be exactly:

```text
LeaderboardEntry
LeaderboardRepository
_rank
SqliteLeaderboardRepository
PostgresLeaderboardRepository
repository_from_env
```

Do not alter SQL, pool sizes, validation, return values, or method signatures during this move.

- [ ] **Step 3: Replace the obsolete factory explanation**

Replace the final paragraph of `repository_from_env()`'s docstring:

```python
    Postgres is deliberately a clear failure rather than a silent fall back to
    a local file: a deployed server quietly writing its scoreboard to a
    container's disk looks exactly like a working one until it restarts.
```

with:

```python
    PostgreSQL URLs select the deployed store. Unknown schemes fail explicitly
    instead of silently falling back to a local SQLite file, because a deployed
    server writing to its container disk only looks durable until it restarts.
```

- [ ] **Step 4: Confirm that the move did not introduce behavioral edits**

Run:

```bash
git diff --color-moved=dimmed-zebra -- backend/leaderboard/repository.py
```

Expected: Git identifies the PostgreSQL class as moved code; the only content changes are `four` to `five` and the corrected factory paragraph.

- [ ] **Step 5: Run leaderboard and protocol tests**

Run:

```bash
cd /Users/yanglinxuan/Documents/snake_game/backend
.venv/bin/python -m pytest tests/test_leaderboard.py tests/test_protocol.py -v
```

Expected: all tests PASS, including factory dispatch and application lifecycle behavior.

- [ ] **Step 6: Commit the repository cleanup**

```bash
git add backend/leaderboard/repository.py
git commit -m "refactor: tidy leaderboard repository layout"
```

---

### Task 3: Synchronize configuration and architecture documentation

**Files:**
- Modify: `backend/.env.example:1-10`
- Modify: `README.md:19-33,67-84,242-258`
- Modify: `education.md:19,224,306`
- Modify: `CLAUDE.md:353-355`

**Interfaces:**
- Consumes: the implemented `DATABASE_URL` selection behavior and pinned backend dependencies.
- Produces: documentation that consistently describes SQLite for local work and PostgreSQL/Supabase for deployed persistence.

- [ ] **Step 1: Update the backend environment example**

Replace the opening database section of `backend/.env.example` with:

```dotenv
# Where the solo leaderboard lives. The only configuration the backend has.
#
#   sqlite:///./leaderboard.db    local file; the default
#   sqlite:///:memory:            transient database for isolated runs
#   postgresql://user@host/db     deployed PostgreSQL database
#
# Keep credentials out of this file. Set the real PostgreSQL URL as a secret
# environment variable in the deployment platform.
DATABASE_URL=sqlite:///./leaderboard.db
```

Keep the existing `PORT` comments below this block unchanged.

- [ ] **Step 2: Update README dependencies and configuration**

Change the backend technology bullets to state that SQLite is used locally and Psycopg/PostgreSQL is used for deployed persistence. Change `four pinned dependencies` to `five pinned dependencies`.

Replace the backend `DATABASE_URL` example and its PostgreSQL explanation with:

```text
sqlite:///./leaderboard.db    a local file — the default, created on first run
sqlite:///:memory:            nothing survives the process
postgresql://user@host/db     a deployed PostgreSQL database
```

```markdown
- Rooms are not configured because rooms are not stored: they live in memory and
  are worth nothing once everyone leaves.
- The leaderboard is the only durable state, behind a `LeaderboardRepository`
  Protocol (`backend/leaderboard/repository.py`); `repository_from_env()`
  selects SQLite or PostgreSQL from the URL scheme.
- SQLite remains the zero-setup local default. Deployments set `DATABASE_URL`
  to a secret PostgreSQL connection string; unsupported schemes fail at startup
  instead of silently writing to an ephemeral container file.
```

In the repository tree, replace:

```text
repository.py       # the Protocol, and the SQLite implementation
```

with:

```text
repository.py       # the Protocol, SQLite/PostgreSQL stores, and URL factory
```

- [ ] **Step 3: Update the learning guide**

Change the project overview bullet to:

```markdown
- 單人模式：48 × 27 棋盤、暫停與重置、配色循環、持久化排行榜。
```

Change the worker-thread explanation so it refers to blocking database operations rather than SQLite alone:

```markdown
在單一 asyncio event loop 中，沒有 `await` 的同步規則區段不會被其他 coroutine 插入，因此核心遊戲不需要執行緒鎖。耗時的同步資料庫操作則應移到 worker thread，避免阻塞所有房間的時鐘。
```

Replace the first paragraph under `重點八：持久化邊界` with:

```markdown
只有單人排行榜會寫入資料庫。`backend/leaderboard/repository.py` 用 `LeaderboardRepository` Protocol 隔離儲存實作：本機預設使用 SQLite，部署環境可透過 `DATABASE_URL` 使用 PostgreSQL。遊戲與 WebSocket 協定不需要知道實際資料庫種類。
```

- [ ] **Step 4: Update the backend dependency note in `CLAUDE.md`**

Replace:

```markdown
FastAPI + uvicorn, four dependencies pinned in `requirements.txt`, plus SQLite
from the standard library.
```

with:

```markdown
FastAPI + uvicorn, five dependencies pinned in `requirements.txt`: SQLite from
the standard library for local storage, plus Psycopg and its pool extra for
deployed PostgreSQL.
```

- [ ] **Step 5: Prove that no obsolete PostgreSQL refusal language remains**

Run:

```bash
cd /Users/yanglinxuan/Documents/snake_game
rg -n "not built yet|raises on startup|Postgres is a new class|four dependencies|現在提供 SQLite；若要加入 PostgreSQL" README.md education.md CLAUDE.md backend/.env.example backend/leaderboard backend/tests
```

Expected: no matches.

- [ ] **Step 6: Review the documentation diff for leaked credentials**

Run:

```bash
git diff --check
git diff -- backend/.env.example README.md education.md CLAUDE.md
```

Expected: `git diff --check` exits successfully; examples contain only `user@host/db`, never a real Supabase hostname, project reference, password, or copied connection string.

- [ ] **Step 7: Commit the documentation update**

```bash
git add backend/.env.example README.md education.md CLAUDE.md
git commit -m "docs: describe PostgreSQL leaderboard storage"
```

---

### Task 4: Complete regression and deployment-readiness verification

**Files:**
- Verify: `backend/leaderboard/repository.py`
- Verify: `backend/tests/test_leaderboard.py`
- Verify: `backend/requirements.txt`
- Verify: `backend/.env.example`
- Verify: `README.md`
- Verify: `education.md`
- Verify: `CLAUDE.md`

**Interfaces:**
- Consumes: all changes from Tasks 1-3.
- Produces: a passing backend suite and a credential-free diff ready for the user to deploy with a Render `DATABASE_URL` secret.

- [ ] **Step 1: Install the exact backend dependency set**

Run:

```bash
cd /Users/yanglinxuan/Documents/snake_game/backend
.venv/bin/python -m pip install -r requirements.txt
```

Expected: installation succeeds and includes `psycopg`, `psycopg-binary`, and `psycopg-pool` without changing `requirements.txt`.

- [ ] **Step 2: Run the complete backend test suite from the configured root**

Run:

```bash
cd /Users/yanglinxuan/Documents/snake_game/backend
.venv/bin/python -m pytest -q
```

Expected: all tests PASS; there is no PostgreSQL DNS lookup, connection timeout, or `NotImplementedError` expectation.

- [ ] **Step 3: Compile the backend modules**

Run:

```bash
cd /Users/yanglinxuan/Documents/snake_game/backend
.venv/bin/python -m compileall -q .
```

Expected: command exits successfully with no syntax or import error.

- [ ] **Step 4: Inspect the final working tree**

Run:

```bash
cd /Users/yanglinxuan/Documents/snake_game
git status --short
git diff --check
```

Expected: only intentional uncommitted changes, if any, are listed; `git diff --check` succeeds. Do not discard unrelated user changes.

- [ ] **Step 5: Perform a user-owned Supabase read-only smoke test**

In an interactive `zsh` session, read the connection string without placing it in shell history:

```bash
cd /Users/yanglinxuan/Documents/snake_game/backend
read -s "DATABASE_URL?Paste the Supabase Session pooler URL: "
export DATABASE_URL
.venv/bin/python -c "from leaderboard.repository import repository_from_env; store = repository_from_env(); print(type(store).__name__, store.top(1)); store.close()"
unset DATABASE_URL
```

Expected: output begins with `PostgresLeaderboardRepository` and returns either `[]` or the current first leaderboard entry. This step creates the schema if missing but does not insert or delete a score. Never paste the URL into a committed file or task message.

- [ ] **Step 6: Record final verification evidence**

Capture in the implementation handoff:

```text
- focused leaderboard tests: PASS
- full backend suite: PASS with the exact test count
- compileall: PASS
- stale-document search: no matches
- credential scan: no real database URL in the diff
- optional Supabase smoke test: PASS or explicitly not run because credentials remained user-owned
```

No additional commit is needed when this task produces no file changes.
