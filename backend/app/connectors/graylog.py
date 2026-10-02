import base64
import logging
import time

import requests

from app.core.config import settings

logger = logging.getLogger("centro.connectors.graylog")


class GraylogError(Exception):
    pass


class GraylogClient:
    """Conector Graylog (solo lectura preferentemente).

    Soporta autenticacion por Token o por usuario/password (HTTP Basic).
    No fuerza orden ascendente en ventanas amplias (puede colgar el cluster).
    """

    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        user: str | None = None,
        password: str | None = None,
        verify_ssl: bool | None = None,
        timeout: int | None = None,
    ):
        self.base_url = (base_url or settings.GRAYLOG_URL).rstrip("/")
        self.api_url = f"{self.base_url}/api"
        self.token = token if token is not None else settings.GRAYLOG_API_TOKEN
        self.user = user if user is not None else settings.GRAYLOG_USER
        self.password = (
            password if password is not None else settings.GRAYLOG_PASSWORD
        )
        self.verify = (
            settings.GRAYLOG_VERIFY_SSL if verify_ssl is None else verify_ssl
        )
        self.timeout = timeout or settings.GRAYLOG_TIMEOUT

    def is_configured(self) -> bool:
        return bool((self.user and self.password) or self.token)

    def _headers(self) -> dict:
        headers = {"Accept": "application/json"}
        if self.user and self.password:
            credentials = base64.b64encode(
                f"{self.user}:{self.password}".encode("utf-8")
            ).decode("ascii")
            headers["Authorization"] = f"Basic {credentials}"
        elif self.token:
            headers["Authorization"] = f"Token {self.token}"
        return headers

    def _get(self, path: str, params: dict | None = None) -> dict:
        if not self.is_configured():
            raise GraylogError(
                "Graylog no configurado: define GRAYLOG_USER/GRAYLOG_PASSWORD o GRAYLOG_API_TOKEN"
            )
        url = f"{self.api_url}{path}"
        logger.info("graylog GET %s %s", url, params)

        response = None
        for attempt in range(1, 4):
            try:
                response = requests.get(
                    url,
                    headers=self._headers(),
                    params=params,
                    verify=self.verify,
                    timeout=self.timeout,
                )
            except requests.RequestException as exc:
                if attempt < 3:
                    time.sleep(2 * attempt)
                    continue
                raise GraylogError(f"No se pudo conectar a Graylog: {exc}") from exc
            if response.status_code in (429, 502, 503, 504) or (
                response.status_code == 400 and "search" in path
            ):
                if attempt < 3:
                    time.sleep(2 * attempt)
                    continue
            break

        logger.info("graylog <- %s (%s bytes)", response.status_code, len(response.content))
        if response.status_code == 401:
            raise GraylogError("Credenciales de Graylog invalidas (401)")
        if response.status_code >= 400:
            raise GraylogError(
                f"Graylog respondio {response.status_code}: {response.text[:200]}"
            )
        return response.json()

    def test_connection(self) -> dict:
        system = self._get("/system")
        return {
            "version": system.get("version"),
            "hostname": system.get("hostname"),
            "cluster_id": system.get("cluster_id"),
        }

    def list_streams(self) -> list[dict]:
        data = self._get("/streams")
        return [
            {
                "id": s.get("id"),
                "title": s.get("title"),
                "disabled": s.get("disabled"),
            }
            for s in data.get("streams", [])
        ]

    def search_relative(
        self,
        query: str = "*",
        range_seconds: int = 3600,
        limit: int = 150,
        offset: int = 0,
    ) -> dict:
        return self._get(
            "/search/universal/relative",
            {"query": query, "range": range_seconds, "limit": limit, "offset": offset},
        )

    def iter_messages(
        self,
        query: str = "*",
        range_seconds: int = 3600,
        max_messages: int = 1000,
        batch: int = 150,
    ):
        offset = 0
        fetched = 0
        while fetched < max_messages:
            limit = min(batch, max_messages - fetched)
            data = self.search_relative(
                query=query, range_seconds=range_seconds, limit=limit, offset=offset
            )
            messages = data.get("messages", [])
            if not messages:
                break
            for item in messages:
                yield item
            fetched += len(messages)
            offset += len(messages)
            if len(messages) < limit:
                break
