"""LiveKit token generation and room management."""
from __future__ import annotations

from livekit.api import AccessToken, VideoGrants, LiveKitAPI
from livekit.api import ListRoomsRequest, ListParticipantsRequest

from app.config import LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_HOST, LIVEKIT_PUBLIC_WS_URL


def livekit_ws_url_for_client(request_origin: str = "") -> str:
    """
    Return the LiveKit WebSocket URL the client should connect to.

    Priority order:
    1. LIVEKIT_PUBLIC_WS_URL env var (explicit override, e.g. for cloud LiveKit)
    2. Auto-derived from the request's Origin header — if the client came from a
       non-localhost host (phone, LAN laptop) we swap in that host at LiveKit's port.
       This means zero config for LAN demos: the phone automatically gets
       ws://192.168.x.x:7880 just because it connected from that IP.
    3. Fallback: derive from LIVEKIT_HOST (always ws://localhost:7880 in dev).
    """
    if LIVEKIT_PUBLIC_WS_URL:
        return LIVEKIT_PUBLIC_WS_URL

    if request_origin:
        from urllib.parse import urlparse
        parsed = urlparse(request_origin)
        host = parsed.hostname or ""
        # Only remap for non-local clients — localhost stays on localhost
        if host and host not in ("localhost", "127.0.0.1", "::1"):
            livekit_port = urlparse(LIVEKIT_HOST).port or 7880
            scheme = "wss" if parsed.scheme == "https" else "ws"
            return f"{scheme}://{host}:{livekit_port}"

    return LIVEKIT_HOST.replace("https://", "wss://").replace("http://", "ws://")


def generate_manager_token(room_name: str, identity: str, display_name: str = "") -> str:
    """
    Manager JWT: can publish microphone audio (push-to-talk),
    subscribes to all worker video + audio streams.
    """
    token = AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    token.with_identity(identity)
    token.with_name(display_name or identity)
    token.with_grants(
        VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_publish_sources=["microphone"],  # managers only publish audio
            can_subscribe=True,
        )
    )
    return token.to_jwt()


def generate_worker_token(room_name: str, identity: str, display_name: str = "") -> str:
    """
    Worker JWT: publishes camera video + microphone audio,
    subscribes to manager audio instructions.
    """
    token = AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    token.with_identity(identity)
    token.with_name(display_name or identity)
    token.with_grants(
        VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,       # video + audio from helmet cam
            can_subscribe=True,     # hear manager PTT audio
        )
    )
    return token.to_jwt()


async def list_rooms() -> list[dict]:
    """Return list of active LiveKit rooms via RoomService."""
    async with LiveKitAPI(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) as lk:
        resp = await lk.room.list_rooms(ListRoomsRequest())
    return [
        {
            "name": r.name,
            "num_participants": r.num_participants,
            "creation_time": r.creation_time,
        }
        for r in resp.rooms
    ]


async def list_participants(room_name: str) -> list[dict]:
    """Return participants currently in a LiveKit room."""
    async with LiveKitAPI(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) as lk:
        resp = await lk.room.list_participants(ListParticipantsRequest(room=room_name))
    return [
        {
            "identity": p.identity,
            "name": p.name,
            "state": p.state,
            "joined_at": p.joined_at,
        }
        for p in resp.participants
    ]
