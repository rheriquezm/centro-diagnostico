from app.core.config import settings
from app.services.ai.base import AIProvider
from app.services.ai.heuristic import HeuristicProvider
from app.services.ai.ollama import OllamaProvider
from app.services.ai.openai_provider import OpenAIProvider


def get_provider() -> AIProvider:
    provider = (settings.AI_PROVIDER or "none").lower()
    try:
        if provider == "ollama":
            return OllamaProvider()
        if provider in ("openai", "azure", "compatible"):
            return OpenAIProvider()
    except Exception:  # noqa: BLE001
        # Si el proveedor falla al inicializar, se degrada a heuristico.
        return HeuristicProvider()
    return HeuristicProvider()
