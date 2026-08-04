# find-artists: move Reddit scraping onto OAuth (Devvit token)

**Date:** 2026-08-04
**Status:** Done

## Goal

`skills/find-artists` fetches Self-Promotion posts and OP comments again, by
authenticating every Reddit request with the Devvit OAuth access token in
`~/.devvit/token`, refreshing it automatically when it expires, and refusing to
issue anything other than read-only GET requests.

## Context

### What broke

Reddit now blocks unauthenticated JSON endpoints. Verified on 2026-08-04:

| Request | Result |
|---|---|
| `GET www.reddit.com/r/ProgressionFantasy/search.json?...` | `403` |
| `GET www.reddit.com/comments/<id>.json?...` | `403` |
| `GET oauth.reddit.com/r/ProgressionFantasy/search?...` + bearer | `200` |
| `GET oauth.reddit.com/comments/<id>?...` + bearer | `200` |

The authenticated responses have the same shape as the old ones — the search
listing still returns `data.children[].data` plus an `after` cursor, and the
comments endpoint still returns the two-element `[post, comments]` array. So
`reddit_search.py` and `fetch_posts.py` only need a different host, a header,
and the `.json` suffix dropped. Their parsing logic is untouched.

Two things do **not** need to change:

- `historical.py` talks to PullPush (`api.pullpush.io`), which still answers
  `200` unauthenticated.
- Cover downloads. `i.redd.it` and `preview.redd.it` both serve `200` with no
  auth header, so the extraction subagent's download step is unaffected.

### The Devvit token

`~/.devvit/token` is JSON: `{"token": "<base64>", "copyPaste": true}`. The
base64 decodes to `{refreshToken, accessToken, expiresAt, scope, tokenType}` —
this is `StoredToken` from `@devvit/cli`, written by `AuthTokenStore.writeFSToken`.
The account is `/u/samreay`, `scope` is `*`, and `expiresAt` is epoch
milliseconds.

Access tokens last 24 hours (`expires_in: 86400`), so any long backlog run will
outlive its token. Refreshing works and is safe — verified against the same
call `@devvit/cli` makes in `lib/http/oauth.js`:

```
POST https://www.reddit.com/api/v1/access_token
Authorization: Basic base64("TWTsqXa53CexlrYGBWaesQ:")   # Devvit copy-paste client, no secret
User-Agent: devvit-cli
grant_type=refresh_token&refresh_token=<refreshToken>
```

That returned `200` with a fresh `access_token`, and critically the
`refresh_token` came back **unchanged**, so refreshing does not rotate the
credential and cannot desync the Devvit CLI's own copy of it. We still write
the whole grant back in Devvit's exact on-disk format so the CLI picks up the
newer access token too.

### Rate limits

Reddit's free tier is 100 queries/minute per OAuth **client id**, averaged over
a 10-minute window, with `X-Ratelimit-Remaining` / `X-Ratelimit-Reset` headers
on responses that carry them ([Reddit Data API
Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki)).
Devvit's copy-paste client id is shared by every Devvit CLI user, so our slice
of that budget is not ours alone. The scripts should stay conservative (~1 req/s),
read the headers when Reddit sends them, and honour `Retry-After` on 429 rather
than the current fixed sleeps.

The current per-post cost in `fetch_posts.py` is 8 seconds of sleep
(`time.sleep(6)` after the fetch plus `time.sleep(2)` at the end of the loop),
which is far slower than necessary and makes a backlog run take hours.

### Non-goals

- No write access. This skill reads posts and comments; it must never vote,
  comment, edit, or delete. That is enforced in code, not just by convention.
- No change to `historical.py`, the extraction subagent, `sync_covers.py`, or
  the artists data format.
- Not registering a personal Reddit script app right now. The auth module gets
  an env-var escape hatch for one so it is a config change later, not a rewrite.

## Affected files

```
+ skills/find-artists/scripts/reddit_auth.py
~ skills/find-artists/scripts/reddit_search.py
~ skills/find-artists/scripts/fetch_posts.py
~ skills/find-artists/SKILL.md
~ docs/DECISIONS.md
```

## Tasks

- [x] 1. Create the shared auth module (`skills/find-artists/scripts/reddit_auth.py`).
      Standalone module with `# /// script` metadata declaring `requests>=2.31`,
      importable by its siblings (uv puts the script's directory on `sys.path`).
      It exposes:

      - `DevvitToken` dataclass — `access_token`, `refresh_token`, `expires_at`
        (aware datetime), `scope`, `copy_paste`. Its `__repr__` must redact the
        token strings so a stray traceback never leaks a credential.
      - `load_token(path=None)` — reads `$DEVVIT_TOKEN_PATH` or
        `~/.devvit/token`, parses the outer JSON, base64-decodes the inner
        payload. Raises `RedditAuthError` with "run `npx devvit login`" when the
        file is missing or malformed.
      - `refresh(token)` — the POST above; returns a new `DevvitToken`.
      - `save_token(token, path)` — re-encodes to Devvit's exact format
        (`{"token": base64(json), "copyPaste": bool}`) and writes atomically via
        a temp file + `os.replace`, chmod `0600`.
      - `ensure_fresh(token)` — refresh when fewer than 5 minutes remain, save,
        return. No-op otherwise.
      - Escape hatch: if `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` /
        `REDDIT_REFRESH_TOKEN` are all set, use those instead of the Devvit file
        (same refresh call, different Basic credentials, nothing written to disk).

- [x] 2. Add the read-only session to the same module.
      `reddit_session(user_agent)` returns a `requests.Session` subclass whose
      `request()`:

      - rejects any method other than `GET`/`HEAD` by raising
        `ReadOnlyViolation` before a socket is opened — this is the enforcement
        of the never-modify rule;
      - resolves relative paths against `https://oauth.reddit.com` and refuses
        absolute URLs pointing anywhere else;
      - sets `Authorization: Bearer …`, the `User-Agent`, and `raw_json=1`;
      - on `401`, refreshes once, rewrites the header, retries once, then gives up;
      - on `429`, sleeps `Retry-After` (default 60s) and retries up to 3 times;
      - after each response, if `X-Ratelimit-Remaining` is present and below
        ~10, sleeps until `X-Ratelimit-Reset`;
      - otherwise paces itself with a configurable `min_interval` (default 1.1s)
        measured between request starts, not as a blind post-hoc sleep.

- [x] 3. Add a `--whoami` smoke check to `reddit_auth.py`'s `main()` that prints
      the account name, token expiry, and remaining rate limit. This is the
      one-liner for confirming auth before kicking off a long run, and it
      doubles as the module's manual test.

- [x] 4. Port `reddit_search.py`. Replace `SEARCH_URL` with the relative path
      `/r/ProgressionFantasy/search`, build the session via
      `reddit_auth.reddit_session(USER_AGENT)`, and delete the manual
      `session.headers[...]`, the `raw_json` param, and the
      `REQUEST_DELAY_SECONDS` sleep (the session paces itself). Keep
      `fetch_page_with_retry` as a thin wrapper — the session now handles 429,
      so it only needs to catch non-429 `HTTPError`.

- [x] 5. Port `fetch_posts.py`. Change the comments URL to `/comments/{post_id}`,
      swap in the shared session, and remove both `time.sleep(6)` and the
      trailing `time.sleep(2)`. Keep the existing `http_404` / `http_403`
      terminal-status handling and the 3-attempt retry counter, but let the
      session own 429 backoff so a rate limit no longer burns one of the three
      attempts. Fail fast with the `devvit login` message if
      `RedditAuthError` is raised at startup, before any CSV is touched.

- [x] 6. Update `skills/find-artists/SKILL.md`:

      - New **Authentication** section near the top — the skill requires a
        Devvit login (`npx devvit login`, copy-paste flow), the token lives at
        `~/.devvit/token`, it auto-refreshes, and every request is a read-only
        GET against `oauth.reddit.com`.
      - Prerequisite check: `uv run skills/find-artists/scripts/reddit_auth.py --whoami`
        before Part One.
      - Correct the Part One description of `reddit_search.py` (it no longer
        hits `search.json`) and the rate-limit note (100 QPM per client id,
        shared Devvit client, ~1 req/s pacing, `Retry-After` respected).
      - Troubleshooting: `401` after a refresh attempt or a missing token file
        both mean "log in again"; `403` on a specific post still means deleted
        or private, not an auth problem.

- [x] 7. Append ADR-012 to `docs/DECISIONS.md` (text under "Architectural decision").

## Verification

### Auth smoke check

```bash
uv run skills/find-artists/scripts/reddit_auth.py --whoami
```

Expected: prints `samreay`, a token expiry in the future, and exits 0.

### Read-only guard

```bash
uv run python -c "
import sys; sys.path.insert(0, 'skills/find-artists/scripts')
import reddit_auth
s = reddit_auth.reddit_session('test')
try:
    s.post('/api/vote'); print('FAIL: write allowed')
except reddit_auth.ReadOnlyViolation:
    print('OK: writes blocked')
"
```

Expected: `OK: writes blocked`. Also confirm with a network capture or by
inspection that no code path in the skill constructs a non-GET Reddit request.

### End-to-end

```bash
uv run skills/find-artists/scripts/reddit_search.py
uv run skills/find-artists/scripts/fetch_posts.py
```

Expected: `reddit_search.py` writes a non-empty
`scripts/data/historical/reddit_search.csv` with recent post ids;
`fetch_posts.py` processes the backlog with no `HTTP 403` lines and writes new
`references/to_extract/<id>.md` files whose front-matter and `## Image URLs`
sections look like the ones already in `references/extracted/`.

### Token refresh

Set `expiresAt` to a past timestamp in a **copy** of the token file, point
`DEVVIT_TOKEN_PATH` at it, and run `--whoami`. Expected: the script refreshes,
rewrites the copy in Devvit's format, and still reports `samreay`. Confirm the
real `~/.devvit/token` is untouched and that `npx devvit whoami` still works
afterwards.

### Manual checks

- [ ] `~/.devvit/token` keeps mode `0600` and the same `{"token", "copyPaste"}`
      shape after a refresh, and `npx devvit whoami` still succeeds.
- [ ] No token, access token, or refresh token appears in any script's stdout,
      stderr, or in `scripts/data/*.csv`.
- [ ] A deleted post still records as `http_404`/`http_403` in `fetched.csv`
      and is not retried.
- [ ] `npm run build` exits 0 after the covers are promoted (unchanged Part Three).

## Architectural decision (ADR)

**Decision:** ADR-012 — Authenticate `find-artists` Reddit reads with the Devvit
CLI's stored OAuth token, through a read-only session wrapper.

**Why:** Reddit returns `403` for unauthenticated `*.json` endpoints as of
mid-2026, so the skill needs an OAuth bearer token. Sam already has a Devvit
login for unrelated app development, and `~/.devvit/token` holds a
long-lived `*`-scope user token plus a non-rotating refresh token, so reusing it
avoids registering and managing a second Reddit app's credentials. The
alternative — a personal script app at `reddit.com/prefs/apps` — gives a
dedicated (unshared) rate-limit budget and an unambiguous personal-use posture,
so the auth module keeps an env-var path to it, but it is not worth the setup
until the shared Devvit client's budget actually becomes a problem.

**Consequences:** The skill now has a login prerequisite; if `devvit logout` is
run or the grant is revoked, every fetch fails until `npx devvit login`. The
scripts write to `~/.devvit/token` on refresh, which is outside the repo — the
write is atomic, mode-restricted, and byte-compatible with the CLI's own
format. Because the client id is shared across all Devvit CLI users, our
effective rate limit is unpredictable, so pacing is header-driven rather than a
fixed sleep. The read-only guard in `reddit_session` is the enforcement point
for "this skill never modifies Reddit"; any future need to write must go
through a deliberate, separately-reviewed change rather than a one-line
`session.post`.
