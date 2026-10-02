import logging
import time

import requests

from app.core.config import settings

logger = logging.getLogger("centro.connectors.redmine")


class RedmineError(Exception):
    pass


class RedmineClient:
    """Conector Redmine (solo lectura).

    Nota: algunos WAF bloquean las extensiones `.json` / `.xml`; por eso se usa
    siempre el parametro `?format=json`.
    """

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        verify_ssl: bool | None = None,
        timeout: int | None = None,
    ):
        self.base_url = (base_url or settings.REDMINE_URL).rstrip("/")
        self.api_key = api_key if api_key is not None else settings.REDMINE_API_KEY
        self.verify = (
            settings.REDMINE_VERIFY_SSL if verify_ssl is None else verify_ssl
        )
        self.timeout = timeout or settings.REDMINE_TIMEOUT

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> dict:
        headers = {"Accept": "application/json"}
        if self.api_key:
            headers["X-Redmine-API-Key"] = self.api_key
        return headers

    def _get(self, path: str, params: dict | None = None) -> dict:
        if not self.is_configured():
            raise RedmineError("Redmine no configurado: define REDMINE_API_KEY")
        merged = {"format": "json"}
        if params:
            merged.update(params)
        url = f"{self.base_url}{path}"
        logger.info("redmine GET %s %s", url, merged)

        response = None
        for attempt in range(1, 4):
            try:
                response = requests.get(
                    url,
                    headers=self._headers(),
                    params=merged,
                    verify=self.verify,
                    timeout=self.timeout,
                )
            except requests.RequestException as exc:
                if attempt < 3:
                    time.sleep(2 * attempt)
                    continue
                raise RedmineError(f"No se pudo conectar a Redmine: {exc}") from exc
            if response.status_code in (429, 502, 503, 504) and attempt < 3:
                time.sleep(2 * attempt)
                continue
            break

        logger.info("redmine <- %s", response.status_code)
        if response.status_code == 401:
            raise RedmineError("API key de Redmine invalida (401)")
        if response.status_code == 403:
            raise RedmineError(
                "Redmine rechazo la peticion (403). Verifica la API key o que la API REST este habilitada."
            )
        if response.status_code >= 400:
            raise RedmineError(
                f"Redmine respondio {response.status_code}: {response.text[:200]}"
            )
        return response.json()

    def test_connection(self) -> dict:
        data = self._get("/users/current")
        user = data.get("user", {})
        return {
            "login": user.get("login"),
            "name": f"{user.get('firstname', '')} {user.get('lastname', '')}".strip(),
            "admin": user.get("admin"),
        }

    def fetch_projects(self, limit: int = 100) -> list[dict]:
        data = self._get("/projects", {"limit": limit})
        return [
            {
                "id": p.get("id"),
                "name": p.get("name"),
                "identifier": p.get("identifier"),
            }
            for p in data.get("projects", [])
        ]

    def iter_issues(
        self,
        status_id: str = "*",
        max_issues: int = 500,
        page_size: int = 100,
        include: str | None = None,
    ):
        offset = 0
        fetched = 0
        while fetched < max_issues:
            limit = min(page_size, max_issues - fetched)
            params: dict = {
                "status_id": status_id,
                "limit": limit,
                "offset": offset,
                "sort": "updated_on:desc",
            }
            if include:
                params["include"] = include
            if settings.REDMINE_PROJECT_ID:
                params["project_id"] = settings.REDMINE_PROJECT_ID
            data = self._get("/issues", params)
            issues = data.get("issues", [])
            logger.info(
                "redmine issues offset=%s recibidos=%s total=%s",
                offset,
                len(issues),
                data.get("total_count"),
            )
            if not issues:
                break
            for issue in issues:
                yield issue
            fetched += len(issues)
            offset += len(issues)
            if len(issues) < limit:
                break
