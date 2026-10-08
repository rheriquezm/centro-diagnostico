import json
import re

_JSON_RE = re.compile(r"\{.*\}", re.S)


def parse_json_object(text: str) -> dict:
    """Extrae el primer objeto JSON de un texto de LLM (tolerante a ruido)."""
    text = (text or "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = _JSON_RE.search(text)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
    return {"summary": text}
