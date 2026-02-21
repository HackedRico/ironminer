"""Base agent interface. Each agent implements process()."""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any


class BaseAgent(ABC):
    @abstractmethod
    async def process(self, *args: Any, **kwargs: Any) -> Any:
        ...
