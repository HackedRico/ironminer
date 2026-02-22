"""Swappable LLM client — defaults to Ollama, can switch to Gemini via env var."""
from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod

from app.config import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    LLM_PROVIDER,
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
)


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


# --- Claude variant (commented out; use Gemini or Ollama for now) ---
# class ClaudeClient(LLMClient):
#     """Wraps the existing call_claude() helper."""
#
#     async def chat(self, system: str, user: str) -> str:
#         from app.services.claude_client import call_claude
#
#         return await call_claude(
#             messages=[
#                 {"role": "user", "content": f"{system}\n\n---\n\n{user}"},
#             ],
#             max_tokens=2048,
#         )


class GeminiClient(LLMClient):
    """Same interface as Claude: system + user -> single response text."""

    def __init__(self, api_key: str = GEMINI_API_KEY, model: str = GEMINI_MODEL):
        self.api_key = api_key
        self.model_name = model

    async def chat(self, system: str, user: str) -> str:
        import google.generativeai as genai

        genai.configure(api_key=self.api_key)
        model = genai.GenerativeModel(
            self.model_name,
            system_instruction=system,
        )
        # SDK is sync; run in thread to avoid blocking
        def _generate() -> str:
            response = model.generate_content(
                user,
                generation_config=genai.GenerationConfig(
                    temperature=0.3,
                    max_output_tokens=2048,
                ),
            )
            return response.text or ""

        return await asyncio.to_thread(_generate)


def get_llm_client() -> LLMClient:
    """Factory — reads LLM_PROVIDER env var to pick the backend."""
    if LLM_PROVIDER == "gemini":
        return GeminiClient()
    # if LLM_PROVIDER == "claude":
    #     return ClaudeClient()
    return OllamaClient()
