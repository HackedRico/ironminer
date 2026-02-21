"""LiveKit token generation and room management."""
from __future__ import annotations

from livekit.api import AccessToken, VideoGrants, LiveKitAPI
from livekit.api import ListRoomsRequest, ListParticipantsRequest

from app.config import LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_HOST, LIVEKIT_PUBLIC_WS_URL


def livekit_ws_url_for_client() -> str:
    """
    WebSocket URL to return to clients (browser, phone) in token response.
    If LIVEKIT_PUBLIC_WS_URL is set (e.g. ws://YOUR_LAN_IP:7880), use it so
    devices on the network can connect. Otherwise derive from LIVEKIT_HOST.
    """
    if LIVEKIT_PUBLIC_WS_URL:
        return LIVEKIT_PUBLIC_WS_URL
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
