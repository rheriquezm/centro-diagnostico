import json
import logging

import requests

from app.core.config import settings
from app.services.ai.base import AIProvider

logger = logging.getLogger("centro.ai.openai")


class OpenAIProvider(AIProvider):
    """Compatible con la API de OpenAI (chat completions)."""

    name = "openai"

    def __init__(self):
        self.base_url = (
            settings.OPENAI_BASE_URL
            or settings.AI_BASE_URL
            or "https://api.openai.com/v1"
        ).rstrip("/")
        self.model = settings.OPENAI_MODEL or "gpt-4o-mini"
        self.api_key = settings.OPENAI_API_KEY or settings.AI_API_KEY

    def _chat(self, system: str, user: str) -> dict:
        response = requests.post(
            f"{self.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "response_format": {"type": "json_object"},
                "max_tokens": settings.AI_MAX_OUTPUT_TOKENS,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
            timeout=settings.AI_TIMEOUT_SECONDS,
            verify=settings.AI_VERIFY_SSL,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        return json.loads(content)

    def diagnose(self, context: dict) -> dict:
        return self._chat(
            "Eres un ingeniero SRE. Usa SOLO el contexto. Responde JSON con summary, "
            "technical_explanation, probable_causes, recommended_checks, "
            "recommended_actions, provider_request, severity_reasoning, confidence.",
            json.dumps(context, ensure_ascii=False),
        )

    def answer(self, question: str, context: dict) -> dict:
        return self._chat(
            "Responde en JSON con 'answer' y 'references'. Usa solo el contexto.",
            f"Contexto:\n{json.dumps(context, ensure_ascii=False)}\nPregunta: {question}",
        )
