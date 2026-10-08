import json
import logging

import requests

from app.core.config import settings
from app.services.ai.base import AIProvider
from app.services.ai.json_utils import parse_json_object

logger = logging.getLogger("centro.ai.claude")

SYSTEM_DIAGNOSE = (
    "Eres un ingeniero SRE experto. Analiza SOLO el contexto entregado "
    "(que puede incluir logs de Graylog, tickets de Redmine y estado de Nagios). "
    "Se breve (maximo 6 lineas por campo). No inventes datos. "
    "Responde UNICAMENTE con JSON valido con las claves: summary, "
    "technical_explanation, probable_causes (lista), recommended_checks (lista), "
    "recommended_actions (lista), provider_request, severity_reasoning, confidence (0-1)."
)

SYSTEM_ANSWER = (
    "Eres un analista de operaciones TI. Responde la pregunta usando UNICAMENTE el "
    "contexto entregado, en un parrafo breve. No inventes datos. Responde solo con JSON "
    "con las claves: answer (texto) y references (lista vacia o de {tipo, valor})."
)


class AnthropicProvider(AIProvider):
    """Proveedor Claude (Anthropic Messages API)."""

    name = "claude"

    def __init__(self):
        self.base_url = (
            settings.ANTHROPIC_BASE_URL or "https://api.anthropic.com/v1"
        ).rstrip("/")
        self.model = settings.ANTHROPIC_MODEL or "claude-3-5-sonnet-latest"
        self.api_key = settings.ANTHROPIC_API_KEY

    def _chat(self, system: str, user: str) -> dict:
        response = requests.post(
            f"{self.base_url}/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": self.model,
                "max_tokens": settings.AI_MAX_OUTPUT_TOKENS,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
            timeout=settings.AI_TIMEOUT_SECONDS,
            verify=settings.AI_VERIFY_SSL,
        )
        response.raise_for_status()
        data = response.json()
        content = "".join(
            block.get("text", "")
            for block in data.get("content", [])
            if block.get("type") == "text"
        )
        return parse_json_object(content)

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
