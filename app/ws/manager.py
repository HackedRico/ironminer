"""WebSocket connection manager for live feeds, alerts, and comms."""
from __future__ import annotations
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, channel: str, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(channel, []).append(ws)

    def disconnect(self, channel: str, ws: WebSocket):
        if channel in self.active:
            self.active[channel] = [w for w in self.active[channel] if w != ws]

    async def broadcast(self, channel: str, data: dict):
        for ws in self.active.get(channel, []):
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(channel, ws)


ws_manager = ConnectionManager()
