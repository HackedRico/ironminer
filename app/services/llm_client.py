"""Swappable LLM client — defaults to Ollama, can switch to Claude via env var."""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.config import LLM_PROVIDER, OLLAMA_BASE_URL, OLLAMA_MODEL


class LLMClient(ABC):
    @abstractmethod
    async def chat(self, system: str, user: str) -> str: ...


class OllamaClient(LLMClient):
    """Calls Ollama via CLI subprocess (workaround for Homebrew 0.16.x serve bug)."""

    def __init__(self, model: str = OLLAMA_MODEL):
        self.model = model

    async def chat(self, system: str, user: str) -> str:
        import asyncio
        import json

        prompt = f"{system}\n\n---\n\n{user}"
        proc = await asyncio.create_subprocess_exec(
            "ollama", "run", self.model, prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120.0)
        if proc.returncode != 0:
            raise RuntimeError(f"ollama run failed: {stderr.decode().strip()}")
        return stdout.decode().strip()


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
