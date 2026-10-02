import json
from pathlib import Path

from app.core.config import settings


class AllowedEmails:
    def __init__(self, path: str | Path):
        self.path = Path(path)

    def load(self) -> set[str]:
        if not self.path.exists():
            return set()
        with self.path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            emails = data.get("allowed_emails", [])
        else:
            emails = data
        return {str(email).strip().lower() for email in emails if str(email).strip()}

    def is_allowed(self, email: str) -> bool:
        email = email.strip().lower()
        if email in self.load():
            return True
        domain = email.partition("@")[2]
        return bool(domain) and domain in set(settings.allowed_domains)


allowed_emails = AllowedEmails(settings.ALLOWED_EMAILS_FILE)
