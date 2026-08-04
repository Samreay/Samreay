# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "requests>=2.31",
# ]
# ///
"""Read-only OAuth access to Reddit, using the Devvit CLI's stored token.

Reddit returns 403 for unauthenticated ``*.json`` endpoints, so every request
now goes to ``oauth.reddit.com`` with a bearer token. The token is the one
``devvit login`` writes to ``~/.devvit/token``; it lasts 24 hours and is
refreshed here when it is close to expiry.

This skill only ever reads posts and comments. :class:`RedditReadSession`
enforces that: anything other than GET/HEAD raises :class:`ReadOnlyViolation`
before a socket is opened.

Run directly to check that authentication works::

    uv run skills/find-artists/scripts/reddit_auth.py --whoami
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import tempfile
import time
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import requests

OAUTH_HOST = "oauth.reddit.com"
OAUTH_BASE = f"https://{OAUTH_HOST}"
TOKEN_URL = "https://www.reddit.com/api/v1/access_token"

# Devvit's public "copy paste" OAuth client, as used by @devvit/cli. Public
# client, so the basic-auth password is empty.
DEVVIT_CLIENT_ID = "TWTsqXa53CexlrYGBWaesQ"
DEVVIT_TOKEN_PATH = Path.home() / ".devvit" / "token"

REFRESH_MARGIN = timedelta(minutes=5)
DEFAULT_MIN_INTERVAL = 1.1  # ~55 requests/minute, well under the 100 QPM cap
LOW_RATELIMIT_REMAINING = 10
MAX_BACKOFF_SECONDS = 120
MAX_ATTEMPTS = 4
DEFAULT_TIMEOUT = 30

LOGIN_HINT = "run `npx devvit login` (copy-paste flow) and try again"


class RedditAuthError(RuntimeError):
    """No usable Reddit credentials."""


class ReadOnlyViolation(RuntimeError):
    """A non-GET request was attempted. This skill must never modify Reddit."""


@dataclass
class RedditToken:
    """An OAuth grant, plus where (if anywhere) to persist a refresh of it."""

    access_token: str
    refresh_token: str
    expires_at: datetime
    scope: str
    client_id: str = DEVVIT_CLIENT_ID
    client_secret: str = ""
    # None for env-var credentials: there is no file of ours to update.
    path: Path | None = None
    copy_paste: bool = True

    def __repr__(self) -> str:
        return (
            f"RedditToken(access_token='<redacted>', refresh_token='<redacted>', "
            f"expires_at={self.expires_at.isoformat()}, scope={self.scope!r})"
        )

    def is_fresh(self, margin: timedelta = REFRESH_MARGIN) -> bool:
        return datetime.now(tz=timezone.utc) + margin <= self.expires_at


def _decode_stored_token(blob: str) -> dict[str, Any]:
    padded = blob + "=" * (-len(blob) % 4)
    return json.loads(base64.b64decode(padded))


def _encode_stored_token(token: RedditToken) -> str:
    payload = {
        "refreshToken": token.refresh_token,
        "accessToken": token.access_token,
        "expiresAt": int(token.expires_at.timestamp() * 1000),
        "scope": token.scope,
        "tokenType": "bearer",
    }
    return base64.b64encode(json.dumps(payload).encode()).decode()


def _token_from_env() -> RedditToken | None:
    """Credentials for a personal Reddit script app, if configured.

    Set ``REDDIT_CLIENT_ID``, ``REDDIT_CLIENT_SECRET`` and
    ``REDDIT_REFRESH_TOKEN`` to bypass the Devvit token entirely. Nothing is
    written to disk in that mode; a fresh access token is minted per run.
    """
    client_id = os.environ.get("REDDIT_CLIENT_ID")
    client_secret = os.environ.get("REDDIT_CLIENT_SECRET")
    refresh_token = os.environ.get("REDDIT_REFRESH_TOKEN")
    if not (client_id and client_secret and refresh_token):
        return None

    stale = RedditToken(
        access_token="",
        refresh_token=refresh_token,
        expires_at=datetime.now(tz=timezone.utc) - timedelta(seconds=1),
        scope="read",
        client_id=client_id,
        client_secret=client_secret,
        path=None,
    )
    return refresh(stale)


def load_token(path: Path | None = None) -> RedditToken:
    """Load credentials from the env escape hatch, else from the Devvit token."""
    from_env = _token_from_env()
    if from_env is not None:
        return from_env

    if path is None:
        env_path = os.environ.get("DEVVIT_TOKEN_PATH")
        path = Path(env_path) if env_path else DEVVIT_TOKEN_PATH

    if not path.is_file():
        msg = f"no Devvit token at {path}; {LOGIN_HINT}"
        raise RedditAuthError(msg)

    try:
        outer = json.loads(path.read_text(encoding="utf-8"))
        stored = _decode_stored_token(outer["token"])
        return RedditToken(
            access_token=stored["accessToken"],
            refresh_token=stored["refreshToken"],
            expires_at=datetime.fromtimestamp(stored["expiresAt"] / 1000, tz=timezone.utc),
            scope=stored["scope"],
            path=path,
            copy_paste=bool(outer.get("copyPaste", True)),
        )
    except (ValueError, KeyError, TypeError) as exc:
        msg = f"could not parse the Devvit token at {path} ({exc}); {LOGIN_HINT}"
        raise RedditAuthError(msg) from exc


def refresh(token: RedditToken) -> RedditToken:
    """Exchange the refresh token for a new access token.

    Reddit returns the same refresh token, so this cannot desync the Devvit
    CLI's own copy of the credential.
    """
    response = requests.post(
        TOKEN_URL,
        auth=(token.client_id, token.client_secret),
        headers={"User-Agent": "devvit-cli"},
        data={"grant_type": "refresh_token", "refresh_token": token.refresh_token},
        timeout=DEFAULT_TIMEOUT,
    )
    if not response.ok:
        msg = f"token refresh failed (HTTP {response.status_code}); {LOGIN_HINT}"
        raise RedditAuthError(msg)

    grant = response.json()
    if "access_token" not in grant:
        msg = f"malformed refresh grant: {sorted(grant)}; {LOGIN_HINT}"
        raise RedditAuthError(msg)

    return replace(
        token,
        access_token=grant["access_token"],
        refresh_token=grant.get("refresh_token", token.refresh_token),
        expires_at=datetime.now(tz=timezone.utc) + timedelta(seconds=int(grant["expires_in"])),
        scope=grant.get("scope", token.scope),
    )


def save_token(token: RedditToken) -> None:
    """Write the token back in Devvit's on-disk format, atomically and 0600."""
    if token.path is None:
        return

    raw = json.dumps({"token": _encode_stored_token(token), "copyPaste": token.copy_paste})
    token.path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=token.path.parent, prefix=".token-")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(raw)
        tmp.chmod(0o600)
        os.replace(tmp, token.path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def ensure_fresh(token: RedditToken, *, force: bool = False) -> RedditToken:
    if not force and token.is_fresh():
        return token
    refreshed = refresh(token)
    save_token(refreshed)
    return refreshed


class RedditReadSession(requests.Session):
    """A GET-only session against ``oauth.reddit.com``.

    Handles bearer auth, token refresh, request pacing and 429 backoff so the
    calling scripts only have to think about URLs and payloads.
    """

    def __init__(
        self,
        token: RedditToken,
        user_agent: str,
        min_interval: float = DEFAULT_MIN_INTERVAL,
    ) -> None:
        super().__init__()
        self.token = token
        self.min_interval = min_interval
        self._next_request_at = 0.0
        self.headers["User-Agent"] = user_agent
        self._apply_token()

    def _apply_token(self) -> None:
        self.headers["Authorization"] = f"Bearer {self.token.access_token}"

    def _refresh_token(self, *, force: bool = False) -> None:
        self.token = ensure_fresh(self.token, force=force)
        self._apply_token()

    def _resolve(self, url: str) -> str:
        if url.startswith("/"):
            return OAUTH_BASE + url
        host = urlsplit(url).netloc
        if host != OAUTH_HOST:
            msg = f"refusing to send an authenticated request to {host or url!r}"
            raise ValueError(msg)
        return url

    def _pace(self) -> None:
        wait = self._next_request_at - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._next_request_at = time.monotonic() + self.min_interval

    def _respect_ratelimit(self, response: requests.Response) -> None:
        try:
            remaining = float(response.headers["x-ratelimit-remaining"])
            reset = float(response.headers["x-ratelimit-reset"])
        except (KeyError, ValueError):
            return
        if remaining <= LOW_RATELIMIT_REMAINING:
            delay = min(reset, MAX_BACKOFF_SECONDS)
            print(  # noqa: T201
                f"[reddit_auth] {remaining:.0f} requests left, sleeping {delay:.0f}s",
                flush=True,
            )
            self._next_request_at = max(self._next_request_at, time.monotonic() + delay)

    def _retry_after(self, response: requests.Response, attempt: int) -> float:
        try:
            return min(float(response.headers["retry-after"]), MAX_BACKOFF_SECONDS)
        except (KeyError, ValueError):
            return min(30.0 * attempt, MAX_BACKOFF_SECONDS)

    def request(self, method: str, url: str, **kwargs: Any) -> requests.Response:  # type: ignore[override]
        verb = method.upper()
        if verb not in {"GET", "HEAD"}:
            msg = f"find-artists is read-only; refusing to {verb} {url}"
            raise ReadOnlyViolation(msg)

        target = self._resolve(url)
        kwargs.setdefault("timeout", DEFAULT_TIMEOUT)
        kwargs["params"] = {"raw_json": 1, **(kwargs.get("params") or {})}

        for attempt in range(1, MAX_ATTEMPTS + 1):
            self._refresh_token()
            self._pace()
            response = super().request(verb, target, **kwargs)

            if response.status_code == 401 and attempt < MAX_ATTEMPTS:
                print("[reddit_auth] 401, refreshing token", flush=True)  # noqa: T201
                self._refresh_token(force=True)
                continue

            if response.status_code == 429 and attempt < MAX_ATTEMPTS:
                delay = self._retry_after(response, attempt)
                print(f"[reddit_auth] rate limited, sleeping {delay:.0f}s", flush=True)  # noqa: T201
                time.sleep(delay)
                continue

            self._respect_ratelimit(response)
            return response

        return response


def reddit_session(user_agent: str, min_interval: float = DEFAULT_MIN_INTERVAL) -> RedditReadSession:
    """Build a read-only OAuth session, refreshing the token if it is stale."""
    return RedditReadSession(ensure_fresh(load_token()), user_agent, min_interval)


def whoami() -> int:
    session = reddit_session("python:samreay-find-artists-auth:v0.1 (by /u/samreay)")
    response = session.get("/api/v1/me")
    if not response.ok:
        print(f"[reddit_auth] HTTP {response.status_code}; {LOGIN_HINT}", file=sys.stderr)  # noqa: T201
        return 1

    me = response.json()
    expires_in = session.token.expires_at - datetime.now(tz=timezone.utc)
    print(f"authenticated as /u/{me.get('name')}")  # noqa: T201
    print(f"scope           {session.token.scope}")  # noqa: T201
    print(  # noqa: T201
        f"token expires   {session.token.expires_at:%Y-%m-%d %H:%M:%S %Z} "
        f"(in {expires_in.total_seconds() / 3600:.1f}h)",
    )
    remaining = response.headers.get("x-ratelimit-remaining")
    if remaining:
        print(f"rate limit      {remaining} remaining, resets in {response.headers.get('x-ratelimit-reset')}s")  # noqa: T201
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--whoami", action="store_true", help="check that Reddit auth works")
    args = parser.parse_args()

    if not args.whoami:
        parser.print_help()
        return 0

    try:
        return whoami()
    except RedditAuthError as exc:
        print(f"[reddit_auth] {exc}", file=sys.stderr)  # noqa: T201
        return 1


if __name__ == "__main__":
    sys.exit(main())
