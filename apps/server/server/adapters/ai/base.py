"""Phase 2-safe AI provider boundary."""

from __future__ import annotations

from abc import ABC, abstractmethod


class AIProvider(ABC):
    """Abstract interface for AI integrations."""

    @abstractmethod
    def generate(self, prompt: str) -> str:
        """Generate a text response for the given prompt."""
