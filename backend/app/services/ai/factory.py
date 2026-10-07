from app.core.config import settings
from app.services.ai.anthropic_provider import AnthropicProvider
from app.services.ai.base import AIProvider
from app.services.ai.heuristic import HeuristicProvider
from app.services.ai.ollama import OllamaProvider
from app.services.ai.openai_provider import OpenAIProvider


def get_provider(name: str | None = None) -> AIProvider:
    provider = (name or settings.AI_PROVIDER or "none").lower()
    try:
        if provider == "ollama":
            return OllamaProvider()
        if provider in ("openai", "chatgpt", "azure", "compatible"):
            return OpenAIProvider()
        if provider in ("claude", "anthropic"):
            return AnthropicProvider()
    except Exception:  # noqa: BLE001
        # Si el proveedor falla al inicializar, se degrada a heuristico.
        return HeuristicProvider()
    return HeuristicProvider()


def openai_configured() -> bool:
    return bool(settings.OPENAI_API_KEY or settings.AI_API_KEY)


def anthropic_configured() -> bool:
    return bool(settings.ANTHROPIC_API_KEY)
