import logging
import time
import uuid
from datetime import date as date_cls

import requests

from app.core.config import settings

logger = logging.getLogger("centro.connectors.yale")


class YaleError(Exception):
    pass


class YaleClient:
    """Conector Yale Connect (ASSA ABLOY) - solo lectura de registros de acceso.

    API descubierta: <base>/Account/Login y
    <base>/AccessControl/GetAccessRegistersForHome, autenticado por header
    `access-token` + `brandPlatformGUID`.
    """

    def __init__(
        self,
        base_url: str | None = None,
        email: str | None = None,
        password: str | None = None,
        brand_guid: str | None = None,
        verify_ssl: bool | None = None,
        timeout: int | None = None,
    ):
        self.base_url = (base_url or settings.YALE_BASE_URL).rstrip("/")
        self.email = email if email is not None else settings.YALE_EMAIL
        self.password = password if password is not None else settings.YALE_PASSWORD
        self.brand_guid = brand_guid or settings.YALE_BRAND_GUID
        self.verify = settings.YALE_VERIFY_SSL if verify_ssl is None else verify_ssl
        self.timeout = timeout or settings.YALE_TIMEOUT
        self.token: str | None = None
        self.account: dict | None = None

    def is_configured(self) -> bool:
        return bool(self.email and self.password)

    def _headers(self, auth: bool = True) -> dict:
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "brandPlatformGUID": self.brand_guid,
        }
        if auth and self.token:
            headers["access-token"] = self.token
        return headers

    def _post(self, path: str, body: dict, auth: bool = True) -> object:
        if not self.is_configured():
            raise YaleError("Yale no configurado: define YALE_EMAIL/YALE_PASSWORD")
        url = f"{self.base_url}/{path.lstrip('/')}"
        for attempt in range(1, 4):
            try:
                response = requests.post(
                    url,
                    headers=self._headers(auth),
                    json=body,
                    verify=self.verify,
                    timeout=self.timeout,
                )
            except requests.RequestException as exc:
                if attempt < 3:
                    time.sleep(2 * attempt)
                    continue
                raise YaleError(f"No se pudo conectar a Yale Connect: {exc}") from exc
            if response.status_code in (429, 502, 503, 504) and attempt < 3:
                time.sleep(2 * attempt)
                continue
            break

        if response.status_code == 401:
            raise YaleError("Yale: no autorizado (token invalido o expirado)")
        if response.status_code >= 400:
            raise YaleError(
                f"Yale respondio {response.status_code}: {response.text[:200]}"
            )
        return response.json()

    def login(self) -> dict:
        payload = {
            "email": self.email,
            "password": self.password,
            "mobileInformation": {
                "os": "Windows 11",
                "information": "Google Chrome",
                "appVersion": "1.0.0",
                "pushToken": "",
                "UUID": str(uuid.uuid4()),
            },
        }
        data = self._post("Account/Login", payload, auth=False)
        if not isinstance(data, dict) or not data.get("accessToken"):
            raise YaleError("Yale: login sin accessToken")
        self.token = data["accessToken"]
        self.account = data.get("accountData")
        return data

    def homes(self) -> list[dict]:
        if self.account is None:
            self.login()
        return (self.account or {}).get("homeList", [])

    def access_registers(self, home_id: int, day: date_cls) -> list[dict]:
        if self.token is None:
            self.login()
        body = {
            "homeId": int(home_id),
            "date": {"year": day.year, "month": day.month, "day": day.day},
        }
        data = self._post("AccessControl/GetAccessRegistersForHome", body)
        return data if isinstance(data, list) else []
