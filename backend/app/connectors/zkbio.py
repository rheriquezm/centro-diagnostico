import hashlib
import logging
import time
from datetime import datetime

import requests

from app.core.config import settings

logger = logging.getLogger("centro.connectors.zkbio")

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36"
)


class ZkbioError(Exception):
    pass


class ZkbioClient:
    """Conector ZKBio CVAccess (ZKTeco) - solo lectura del grid de transacciones.

    Flujo descubierto en trazas reales:
      1. GET  /                     -> crea la sesion anonima y liga el token
      2. POST /login.do             -> autentica (password en MD5, loginType=NORMAL)
      3. GET  /dashboard.do?dashboard
      4. POST /accTransaction.do    -> devuelve las filas del grid

    Todas las peticiones AJAX llevan el header `browser-token` = md5(timestamp_ms),
    generado por el propio front del equipo (public/js/constants.js).
    """

    def __init__(
        self,
        base_url: str | None = None,
        username: str | None = None,
        password: str | None = None,
        timeout: int | None = None,
    ):
        self.base_url = (base_url or settings.ZKBIO_BASE_URL).rstrip("/")
        self.username = username if username is not None else settings.ZKBIO_USERNAME
        self.password = password if password is not None else settings.ZKBIO_PASSWORD
        self.timeout = timeout or settings.ZKBIO_TIMEOUT
        self.session = requests.Session()
        self.token = self._new_token()
        self.logged_in = False

    @staticmethod
    def _new_token() -> str:
        raw = str(int(time.time() * 1000))
        return hashlib.md5(raw.encode()).hexdigest()

    def is_configured(self) -> bool:
        return bool(self.username and self.password)

    def _headers(self, ajax: bool = True, referer: str | None = None) -> dict:
        headers = {
            "User-Agent": BROWSER_UA,
            "Accept-Language": "es-ES,es;q=0.9",
            "browser-token": self.token,
        }
        if ajax:
            headers["X-Requested-With"] = "XMLHttpRequest"
        if referer:
            headers["Referer"] = referer
        return headers

    def _md5(self, value: str) -> str:
        return hashlib.md5(value.encode()).hexdigest()

    def _warmup(self) -> None:
        # El servidor liga el browser-token a la sesion anonima aqui.
        try:
            self.session.get(
                f"{self.base_url}/",
                headers=self._headers(ajax=False),
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise ZkbioError(f"No se pudo contactar ZKBio: {exc}") from exc

    def login(self) -> dict:
        if not self.is_configured():
            raise ZkbioError(
                "ZKBio no configurado: define ZKBIO_USERNAME/ZKBIO_PASSWORD"
            )
        self._warmup()
        body = (
            f"username={self.username}"
            f"&password={self._md5(self.password)}"
            "&loginType=NORMAL"
        )
        try:
            response = self.session.post(
                f"{self.base_url}/login.do",
                headers={
                    **self._headers(),
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data=body,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise ZkbioError(f"No se pudo autenticar en ZKBio: {exc}") from exc
        if response.status_code != 200:
            raise ZkbioError(
                f"ZKBio login respondio {response.status_code}: {response.text[:200]}"
            )
        try:
            data = response.json()
        except ValueError as exc:
            raise ZkbioError("ZKBio login: respuesta no JSON") from exc
        if not isinstance(data, dict) or data.get("ret") != "ok":
            raise ZkbioError(f"ZKBio login fallido: {str(data)[:200]}")
        self.logged_in = True
        # Navegar al dashboard completa el flujo de login del equipo.
        try:
            self.session.get(
                f"{self.base_url}/dashboard.do?dashboard",
                headers=self._headers(),
                timeout=self.timeout,
            )
        except requests.RequestException:
            logger.warning("ZKBio: no se pudo cargar el dashboard tras login")
        return data

    def transactions(
        self,
        start: datetime,
        end: datetime,
        page_size: int | None = None,
    ) -> list[list]:
        """Devuelve las filas crudas (listas) del grid de transacciones."""
        if not self.logged_in:
            self.login()

        page_size = page_size or settings.ZKBIO_PAGE_SIZE
        # Los espacios deben ir como %20: el WAF rechaza espacios literales.
        start_s = start.strftime("%Y-%m-%d %H:%M:%S").replace(" ", "%20")
        end_s = end.strftime("%Y-%m-%d %H:%M:%S").replace(" ", "%20")
        body = (
            f"list&pageSize={page_size}&startTime={start_s}"
            f"&endTime={end_s}&limitCount={page_size}&pageList=true"
        )
        referer = f"{self.base_url}/main.do?home&selectSysCode=Acc"

        response = None
        for attempt in range(1, 4):
            try:
                response = self.session.post(
                    f"{self.base_url}/accTransaction.do",
                    headers={
                        **self._headers(referer=referer),
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    data=body,
                    timeout=self.timeout,
                )
            except requests.RequestException as exc:
                if attempt < 3:
                    time.sleep(2 * attempt)
                    continue
                raise ZkbioError(f"No se pudo consultar ZKBio: {exc}") from exc
            if response.status_code == 201:
                # 201 = sesion expirada/invalida segun el front del equipo.
                logger.warning("ZKBio: sesion invalida (201), reautenticando")
                self.token = self._new_token()
                self.logged_in = False
                self.login()
                continue
            if response.status_code in (429, 502, 503, 504) and attempt < 3:
                time.sleep(2 * attempt)
                continue
            break

        if response is None or response.status_code != 200:
            code = response.status_code if response is not None else "sin respuesta"
            detail = response.text[:200] if response is not None else ""
            raise ZkbioError(f"ZKBio accTransaction respondio {code}: {detail}")
        try:
            data = response.json()
        except ValueError as exc:
            raise ZkbioError("ZKBio accTransaction: respuesta no JSON") from exc
        rows = data.get("rows") if isinstance(data, dict) else None
        return [row.get("data") or [] for row in (rows or [])]

    def test(self) -> dict:
        """Login + conteo de eventos de hoy para validar la conexion."""
        self.login()
        hoy = datetime.now()
        inicio = hoy.replace(hour=0, minute=0, second=0, microsecond=0)
        rows = self.transactions(inicio, hoy)
        return {"eventos_hoy": len(rows), "usuario": self.username}
