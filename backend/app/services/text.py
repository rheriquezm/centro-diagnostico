import math
import re
import unicodedata
from collections import Counter

STOPWORDS = {
    "para", "como", "este", "esta", "esto", "estos", "estas", "desde", "hasta",
    "sobre", "entre", "cuando", "donde", "porque", "sino", "cada", "todo",
    "toda", "todos", "todas", "muy", "mas", "menos", "pero", "aunque", "tras",
    "hacia", "segun", "mediante", "debe", "deben", "puede", "pueden", "tiene",
    "tienen", "hace", "hacen", "sera", "seran", "fue", "son", "con", "sin",
    "los", "las", "del", "una", "unos", "unas", "por", "que", "the", "and",
    "for", "with", "from", "this", "that", "http", "https", "error", "warn",
    "warning", "info", "debug", "fatal", "trace", "exception", "java", "com",
    "org", "gov", "html", "index", "true", "false", "null", "none", "usuario",
    "caso", "casos", "sistema", "servicio", "datos", "aplicacion", "nueva",
    "nuevo", "valor", "campos", "campo",
}

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9._/-]{3,}")


def strip_accents(text: str | None) -> str:
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(text))
    return decomposed.encode("ascii", "ignore").decode("ascii").lower()


def tokenize(text: str | None) -> set[str]:
    normalized = strip_accents(text)
    tokens: set[str] = set()
    for raw in _TOKEN_RE.findall(normalized):
        raw = raw.strip("._/-")
        if len(raw) < 4 or raw.isdigit():
            continue
        if raw not in STOPWORDS:
            tokens.add(raw)
        for part in re.split(r"[._/-]+", raw):
            if len(part) >= 4 and not part.isdigit() and part not in STOPWORDS:
                tokens.add(part)
    return tokens


def idf(document_frequency: Counter, total_docs: int):
    def weight(token: str) -> float:
        return math.log((total_docs + 1) / (1 + document_frequency.get(token, 0)))

    return weight
