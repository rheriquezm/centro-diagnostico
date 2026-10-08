import json
import logging
import time

import requests

from app.core.config import settings
from app.services.ai.base import AIProvider
from app.services.ai.json_utils import parse_json_object

logger = logging.getLogger("centro.ai.gemini")

SYSTEM_DIAGNOSE = (
    "Eres un ingeniero SRE experto. Analiza SOLO el contexto entregado "
    "(logs de Graylog, tickets de Redmine y estado de Nagios). Se breve "
    "(maximo 6 lineas por campo). No inventes datos. Responde UNICAMENTE con "
    "JSON valido con las claves: summary, technical_explanation, "
    "probable_causes (lista), recommended_checks (lista), recommended_actions "
    "(lista), provider_request, severity_reasoning, confidence (0-1)."
)

SYSTEM_ANSWER = (
    "Eres un analista de operaciones TI. Responde la pregunta usando UNICAMENTE el "
    "contexto entregado, en un parrafo breve. No inventes datos. Responde solo con "
    "JSON con las claves: answer (texto) y references (lista vacia o de {tipo, valor})."
)

# Modelos de reserva si el principal fue retirado (404) o renombrado.
MODEL_FALLBACKS = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash"]


class GeminiProvider(AIProvider):
    """Proveedor Google Gemini (tier gratuito) via Generative Language API."""

    name = "gemini"

    def __init__(self):
        self.base_url = (
            settings.GEMINI_BASE_URL
            or "https://generativelanguage.googleapis.com/v1beta"
        ).rstrip("/")
        self.model = settings.GEMINI_MODEL or "gemini-3.5-flash"
        self.api_key = settings.GEMINI_API_KEY

    def _modelos(self) -> list[str]:
        return [self.model] + [m for m in MODEL_FALLBACKS if m != self.model]

    def _chat(self, system: str, user: str) -> dict:
        last_error: Exception | None = None
        for intento in range(2):
            for model in self._modelos():
                response = requests.post(
                    f"{self.base_url}/models/{model}:generateContent",
                    params={"key": self.api_key},
                    json={
                        "systemInstruction": {"parts": [{"text": system}]},
                        "contents": [{"role": "user", "parts": [{"text": user}]}],
                        "generationConfig": {
                            "responseMimeType": "application/json",
                            "maxOutputTokens": settings.AI_MAX_OUTPUT_TOKENS,
                            "temperature": 0.2,
                        },
                    },
                    timeout=settings.AI_TIMEOUT_SECONDS,
                    verify=settings.AI_VERIFY_SSL,
                )
                # 404: modelo retirado; 429/500/503: saturacion -> probar otro/reintentar.
                if response.status_code in (404, 429, 500, 503):
                    last_error = requests.HTTPError(
                        f"Gemini {model} respondio {response.status_code}: "
                        f"{response.text[:160]}"
                    )
                    continue
                response.raise_for_status()
                data = response.json()
                content = ""
                try:
                    content = data["candidates"][0]["content"]["parts"][0]["text"]
                except (KeyError, IndexError, TypeError):
                    content = ""
                return parse_json_object(content)
            time.sleep(1.5)
        if last_error:
            raise last_error
        raise RuntimeError("Gemini: sin modelo disponible")

    def diagnose(self, context: dict) -> dict:
        return self._chat(
            SYSTEM_DIAGNOSE, "Contexto del problema:\n" + json.dumps(context, ensure_ascii=False)
        )

    def answer(self, question: str, context: dict) -> dict:
        result = self._chat(
            SYSTEM_ANSWER,
            f"Contexto:\n{json.dumps(context, ensure_ascii=False)}\nPregunta: {question}",
        )
        return {
            "answer": result.get("answer") or result.get("summary") or "",
            "references": result.get("references") or [],
            "provider": self.name,
        }
