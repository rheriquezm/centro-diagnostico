import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout

from app.core.config import settings
from app.services.ai.factory import get_provider

logger = logging.getLogger("centro.ai.runner")


def _call(func, timeout: int):
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(func)
    try:
        return future.result(timeout=timeout)
    except FuturesTimeout as exc:
        future.cancel()
        raise TimeoutError("IA: tiempo de espera excedido") from exc
    finally:
        executor.shutdown(wait=False)


def structured(
    system: str,
    user: str,
    user_small: str | None = None,
    provider_name: str | None = None,
    timeout_primary: int = 45,
    timeout_ollama: int = 75,
) -> tuple[dict, str]:
    """Proveedor elegido -> Ollama (contexto reducido) -> ({}, 'heuristica')."""
    elegido = (provider_name or settings.AI_PROVIDER or "none").lower()
    if elegido != "ollama":
        try:
            provider = get_provider(provider_name)
            chat = getattr(provider, "_chat", None)
            if chat is not None:
                return _call(lambda: chat(system, user), timeout_primary), elegido
        except Exception as exc:  # noqa: BLE001
            logger.warning("fallo IA %s: %s", elegido, exc)
    try:
        from app.services.ai.ollama import OllamaProvider

        provider = OllamaProvider()
        chat = getattr(provider, "_chat", None)
        if chat is not None:
            return _call(lambda: chat(system, user_small or user), timeout_ollama), "ollama"
    except Exception as exc:  # noqa: BLE001
        logger.warning("fallback Ollama fallo: %s", exc)
    return {}, "heuristica"
