"""Base agent interface. Each agent implements process()."""
from __future__ import annotations
from abc import ABC, abstractmethod


class BaseAgent(ABC):
    @abstractmethod
    async def process(self, **kwargs):
        ...
