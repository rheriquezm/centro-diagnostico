import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout

from app.core.config import settings
from app.services.ai.factory import get_provider

logger = logging.getLogger("centro.ai.runner")


def _call(func, timeout: int):
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(func)
        try:
            return future.result(timeout=timeout)
        except FuturesTimeout as exc:
            raise TimeoutError("IA: tiempo de espera excedido") from exc


def structured(
    system: str,
    user: str,
    user_small: str | None = None,
    provider_name: str | None = None,
) -> tuple[dict, str]:
    """Proveedor elegido -> Ollama (contexto reducido) -> ({}, 'heuristica')."""
    elegido = (provider_name or settings.AI_PROVIDER or "none").lower()
    if elegido != "ollama":
        try:
            provider = get_provider(provider_name)
            chat = getattr(provider, "_chat", None)
            if chat is not None:
                return _call(lambda: chat(system, user), 45), elegido
        except Exception as exc:  # noqa: BLE001
            logger.warning("fallo IA %s: %s", elegido, exc)
    try:
        from app.services.ai.ollama import OllamaProvider

        provider = OllamaProvider()
        chat = getattr(provider, "_chat", None)
        if chat is not None:
            return _call(lambda: chat(system, user_small or user), 75), "ollama"
    except Exception as exc:  # noqa: BLE001
        logger.warning("fallback Ollama fallo: %s", exc)
    return {}, "heuristica"
