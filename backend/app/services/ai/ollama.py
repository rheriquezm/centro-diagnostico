import json
import logging

import requests

from app.core.config import settings
from app.services.ai.base import AIProvider
from app.services.ai.json_utils import parse_json_object

logger = logging.getLogger("centro.ai.ollama")

SYSTEM_DIAGNOSE = (
    "Eres un ingeniero SRE. Analiza SOLO el contexto entregado. "
    "Se breve (maximo 6 lineas por campo). No inventes tickets ni evidencias. "
    "Responde en JSON con: summary (texto), technical_explanation (texto), "
    "probable_causes (lista corta), recommended_checks (lista corta), "
    "recommended_actions (lista corta), provider_request (texto), "
    "severity_reasoning (texto), confidence (numero 0-1)."
)

SYSTEM_ANSWER = (
    "Eres un analista de operaciones TI. Responde la pregunta usando UNICAMENTE el "
    "contexto entregado, en un parrafo breve. No inventes datos. Responde en JSON "
    "con: answer (texto) y references (lista vacia o de {tipo, valor})."
)


class OllamaProvider(AIProvider):
    name = "ollama"

    def __init__(self):
        self.base_url = (
            settings.AI_BASE_URL or "http://host.docker.internal:11434"
        ).rstrip("/")
        self.model = settings.AI_MODEL or "llama3.2:1b"

    def _chat(self, system: str, payload: str) -> dict:
        response = requests.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "stream": False,
                "format": "json",
                "keep_alive": "30m",
                "options": {
                    "num_predict": settings.AI_MAX_OUTPUT_TOKENS,
                    "temperature": 0.2,
                },
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": payload},
                ],
            },
            timeout=settings.AI_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        content = response.json().get("message", {}).get("content", "{}")
        return parse_json_object(content)

    def diagnose(self, context: dict) -> dict:
        return self._chat(
            SYSTEM_DIAGNOSE,
            "Contexto del problema:\n" + json.dumps(context, ensure_ascii=False),
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
