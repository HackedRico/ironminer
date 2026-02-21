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
