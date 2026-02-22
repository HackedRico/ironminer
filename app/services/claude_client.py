"""Claude API wrapper — ported from index.html callClaude()."""
from __future__ import annotations
import anthropic
from app.config import ANTHROPIC_API_KEY


def get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


async def call_claude(
    messages: list[dict],
    max_tokens: int = 1024,
    model: str = "claude-sonnet-4-6",
    system: str = "",
) -> str:
    client = get_client()
    kwargs = dict(model=model, max_tokens=max_tokens, messages=messages)
    if system:
        kwargs["system"] = system
    response = client.messages.create(**kwargs)
    return response.content[0].text
