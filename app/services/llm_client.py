"""Swappable LLM client — defaults to Ollama, can switch to Claude via env var."""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.config import LLM_PROVIDER, OLLAMA_BASE_URL, OLLAMA_MODEL


class LLMClient(ABC):
    @abstractmethod
    async def chat(self, system: str, user: str) -> str: ...


class OllamaClient(LLMClient):
    """Calls Ollama's OpenAI-compatible chat completions endpoint."""

    def __init__(self, base_url: str = OLLAMA_BASE_URL, model: str = OLLAMA_MODEL):
        self.url = f"{base_url}/v1/chat/completions"
        self.model = model

    async def chat(self, system: str, user: str) -> str:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.3,
        }
        import httpx

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(self.url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        return data["choices"][0]["message"]["content"]


class ClaudeClient(LLMClient):
    """Wraps the existing call_claude() helper."""

    async def chat(self, system: str, user: str) -> str:
        from app.services.claude_client import call_claude

        return await call_claude(
            messages=[
                {"role": "user", "content": f"{system}\n\n---\n\n{user}"},
            ],
            max_tokens=2048,
        )


def get_llm_client() -> LLMClient:
    """Factory — reads LLM_PROVIDER env var to pick the backend."""
    if LLM_PROVIDER == "claude":
        return ClaudeClient()
    return OllamaClient()
