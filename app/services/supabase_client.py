"""Lazy Supabase client singleton. Returns None when env vars aren't set."""
from __future__ import annotations

from app.config import SUPABASE_URL, SUPABASE_KEY

_client = None


def get_supabase():
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            return None
        from supabase import create_client
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


def reset_supabase() -> None:
    """Force the next get_supabase() call to create a fresh client.

    Called when we detect a stale HTTP/2 connection (httpx.ReadError errno 35).
    Supabase-py uses httpx with connection pooling; on macOS the pooled HTTP/2
    connection goes idle and the OS returns EAGAIN on the first read after a
    period of inactivity. Resetting the singleton forces a fresh TCP connection.
    """
    global _client
    _client = None
