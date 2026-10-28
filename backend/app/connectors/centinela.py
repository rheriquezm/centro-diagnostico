import logging

import requests

from app.core.config import settings

logger = logging.getLogger("centro.connectors.centinela")


class CentinelaError(Exception):
    pass


def _pick(data: dict, *keys, default=None):
    for key in keys:
        if key in data and data[key] not in (None, "", [], {}):
            return data[key]
    return default


def _num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _nivel(prioridad: float | None, cvss: float | None) -> str:
    """Semaforo de Centinela (> = mas urgente)."""
    if prioridad is not None:
        if prioridad >= 15:
            return "Actuar ya"
        if prioridad >= 11:
            return "Alta"
        if prioridad >= 7:
            return "Media"
        if prioridad >= 4.5:
            return "Puede esperar"
        return "Informativa"
    if cvss is not None:
        if cvss >= 9:
            return "Actuar ya"
        if cvss >= 7:
            return "Alta"
        if cvss >= 4:
            return "Media"
    return "Informativa"


def _as_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple, set)):
        return ", ".join(str(v) for v in value if v is not None)
    return str(value)


def _normalizar_hallazgo(item, idx: int) -> dict:
    f = item if isinstance(item, dict) else {"title": str(item)}
    activo = _pick(
        f, "asset", "activo", "software", "package", "product", "name", "title", "component"
    )
    instalada = _pick(
        f,
        "installedVersion",
        "installed_version",
        "installed",
        "currentVersion",
        "current_version",
    )
    disponible = _pick(
        f,
        "availableVersion",
        "available_version",
        "fixedVersion",
        "fixed_version",
        "latestVersion",
        "latest_version",
        "update",
    )
    cve = _pick(f, "cve", "cves", "cveId", "cve_id", "cveIds", "cve_ids", "cvesList")
    cvss = _num(_pick(f, "cvss", "cvssScore", "cvss_score"))
    prioridad = _num(
        _pick(f, "priority", "prioridad", "priorityScore", "priority_score")
    )
    nivel = _pick(f, "level", "nivel", "priorityLevel", "priority_level", "label")
    if not nivel:
        nivel = _nivel(prioridad, cvss)
    kev = bool(
        _pick(f, "kev", "isKev", "is_kev", "exploited", "inKev", "in_kev", default=False)
    )
    return {
        "id": _as_text(_pick(f, "id", "key", "uuid", default=f"c{idx}")),
        "activo": _as_text(activo) or "—",
        "version_instalada": _as_text(instalada),
        "version_disponible": _as_text(disponible),
        "cve": _as_text(cve),
        "cvss": cvss,
        "prioridad": prioridad,
        "nivel": _as_text(nivel) or "Informativa",
        "impacto": _as_text(
            _pick(f, "impact", "impacto", "impactLevel", "impact_level", "status")
        ),
        "kev": kev,
        "severidad": _as_text(
            _pick(f, "severity", "severidad", "cvssSeverity", "cvss_severity")
        ),
        "resumen": _as_text(
            _pick(f, "summary", "resumen", "description", "title", "name")
        ),
        "url": _as_text(_pick(f, "url", "link", "advisoryUrl", "advisory_url", "reference")),
        "fecha": _as_text(
            _pick(
                f,
                "date",
                "fecha",
                "published",
                "publishedAt",
                "published_at",
                "detectedAt",
                "detected_at",
            )
        ),
    }


def _normalizar_actualizacion(item, idx: int) -> dict:
    u = item if isinstance(item, dict) else {"name": str(item)}
    return {
        "id": _as_text(_pick(u, "id", "key", default=f"u{idx}")),
        "software": _as_text(
            _pick(u, "software", "activo", "asset", "package", "product", "name", "title")
        )
        or "—",
        "instalada": _as_text(
            _pick(
                u,
                "installedVersion",
                "installed_version",
                "installed",
                "currentVersion",
                "version",
            )
        ),
        "disponible": _as_text(
            _pick(
                u,
                "availableVersion",
                "available_version",
                "latestVersion",
                "latest_version",
                "latest",
                "fixedVersion",
                "fixed_version",
            )
        ),
        "criticidad": _num(_pick(u, "criticality", "criticidad", "criticalityLevel")),
        "eol": _as_text(_pick(u, "eol", "endOfLife", "end_of_life")),
        "nota": _as_text(_pick(u, "note", "nota", "status", "detail")),
    }


def _normalizar_inventario(items) -> list[dict]:
    if isinstance(items, dict):
        items = [{"name": k, **(v if isinstance(v, dict) else {"version": v})} for k, v in items.items()]
    if not isinstance(items, list):
        return []
    salida = []
    for item in items:
        if not isinstance(item, dict):
            salida.append(
                {
                    "nombre": _as_text(item),
                    "version": "",
                    "criticidad": None,
                    "entorno": "",
                    "host": "",
                    "ip": "",
                    "os": "",
                    "role": "",
                    "port": None,
                    "eol": "",
                }
            )
            continue
        salida.append(
            {
                "nombre": _as_text(
                    _pick(item, "name", "nombre", "software", "product", "asset")
                )
                or "—",
                "version": _as_text(
                    _pick(
                        item,
                        "version",
                        "installedVersion",
                        "installed_version",
                        "installed",
                    )
                ),
                "criticidad": _num(
                    _pick(item, "criticality", "criticidad", "criticalityLevel")
                ),
                "entorno": _as_text(_pick(item, "environment", "entorno", "env")),
                "host": _as_text(
                    _pick(item, "host", "hostname", "servidor", "machine")
                ),
                "ip": _as_text(
                    _pick(item, "ip", "ipAddress", "ip_address", "address")
                ),
                "os": _as_text(
                    _pick(item, "os", "sistema", "platform", "operatingSystem")
                ),
                "role": _as_text(_pick(item, "role", "rol", "servicio", "service")),
                "port": _pick(item, "port", "puerto"),
                "eol": _as_text(_pick(item, "eol", "endOfLife", "end_of_life")),
            }
        )
    return salida


def _normalizar_hosts(raw: dict) -> list[dict]:
    items = raw.get("hosts") if isinstance(raw, dict) else None
    if not isinstance(items, list):
        return []
    salida = []
    for item in items:
        if not isinstance(item, dict):
            continue
        servicios = item.get("services") or item.get("servicios") or []
        if not isinstance(servicios, list):
            servicios = []
        salida.append(
            {
                "host": _as_text(_pick(item, "host", "hostname", "name")),
                "ip": _as_text(_pick(item, "ip", "ipAddress", "ip_address")),
                "os": _as_text(_pick(item, "os", "platform", "system")),
                "entorno": _as_text(_pick(item, "environment", "entorno", "env")),
                "servicios": [_as_text(servicio) for servicio in servicios],
                "hallazgos": item.get("findings") or item.get("hallazgos") or 0,
                "urgentes": item.get("urgentes") or 0,
                "actualizaciones": item.get("updates")
                or item.get("actualizaciones")
                or 0,
            }
        )
    return salida


class CentinelaClient:
    """Cliente de solo lectura para Centinela (monitor de actualizaciones y CVE)."""

    def __init__(
        self,
        base_url: str | None = None,
        user: str | None = None,
        password: str | None = None,
        verify_ssl: bool | None = None,
        timeout: int | None = None,
    ):
        self.base_url = (base_url or settings.CENTINELA_URL).rstrip("/")
        self.user = user if user is not None else settings.CENTINELA_USER
        self.password = password if password is not None else settings.CENTINELA_PASSWORD
        self.verify_ssl = (
            settings.CENTINELA_VERIFY_SSL if verify_ssl is None else verify_ssl
        )
        self.timeout = timeout or settings.CENTINELA_TIMEOUT

    def is_configured(self) -> bool:
        return bool(self.base_url)

    def _auth(self):
        if self.user and self.password:
            return (self.user, self.password)
        return None

    def _get(self, path: str) -> dict:
        url = f"{self.base_url}{path}"
        try:
            response = requests.get(
                url,
                auth=self._auth(),
                timeout=self.timeout,
                verify=self.verify_ssl,
            )
        except requests.exceptions.Timeout as exc:
            logger.warning("timeout Centinela %s%s (%ss)", self.base_url, path, self.timeout)
            raise CentinelaError(
                f"Centinela no respondio a tiempo ({self.timeout}s). "
                "Revisa que el servicio este activo y sin bloqueos de red."
            ) from exc
        except requests.exceptions.ConnectionError as exc:
            logger.warning("sin conexion Centinela %s%s: %s", self.base_url, path, exc)
            raise CentinelaError(
                f"No se pudo conectar con Centinela en {self.base_url}. "
                "Verifica que este en ejecucion (puerto 4310) y que el contenedor lo alcance."
            ) from exc
        except requests.exceptions.RequestException as exc:
            logger.warning("error de red Centinela %s%s: %s", self.base_url, path, exc)
            raise CentinelaError(
                "Error de red al consultar Centinela. Revisa la URL configurada."
            ) from exc
        if response.status_code == 401:
            raise CentinelaError(
                "Centinela requiere autenticacion (revisa CENTINELA_USER/CENTINELA_PASSWORD)."
            )
        if not response.ok:
            raise CentinelaError(
                f"Centinela respondio HTTP {response.status_code} en {path}."
            )
        try:
            data = response.json()
        except ValueError as exc:
            raise CentinelaError("Centinela no devolvio JSON valido.") from exc
        if not isinstance(data, dict):
            raise CentinelaError("Centinela devolvio un formato inesperado.")
        return data

    def _post(self, path: str) -> dict:
        url = f"{self.base_url}{path}"
        try:
            response = requests.post(
                url,
                auth=self._auth(),
                json={},
                timeout=self.timeout,
                verify=self.verify_ssl,
            )
        except requests.exceptions.Timeout as exc:
            raise CentinelaError(
                f"Centinela no respondio a tiempo ({self.timeout}s)."
            ) from exc
        except requests.exceptions.ConnectionError as exc:
            raise CentinelaError(
                f"No se pudo conectar con Centinela en {self.base_url}."
            ) from exc
        except requests.exceptions.RequestException as exc:
            raise CentinelaError("Error de red al consultar Centinela.") from exc
        if not response.ok:
            raise CentinelaError(
                f"Centinela respondio HTTP {response.status_code} en {path}."
            )
        try:
            data = response.json()
        except ValueError:
            return {}
        return data if isinstance(data, dict) else {}

    def trigger_sync(self) -> dict:
        return self._post("/api/sync")

    def health(self) -> dict:
        return self._get("/api/health")

    def state(self) -> dict:
        return self._get("/api/state")

    def normalizar(self, raw: dict) -> dict:
        findings_raw = _pick(raw, "findings", "alerts", "alertas", "items", "results", default=[])
        if not isinstance(findings_raw, list):
            findings_raw = []
        findings = [_normalizar_hallazgo(item, i) for i, item in enumerate(findings_raw)]

        updates_raw = _pick(raw, "updates", "actualizaciones", "pendingUpdates", default=[])
        if not isinstance(updates_raw, list):
            updates_raw = []
        updates = [_normalizar_actualizacion(item, i) for i, item in enumerate(updates_raw)]

        config = _pick(raw, "config", "configuracion", default={})
        if not isinstance(config, dict):
            config = {}
        inventory_raw = _pick(raw, "inventory", default=None)
        if inventory_raw is None:
            inventory_raw = _pick(
                config, "inventory", "inventario", "assets", "software", default=[]
            )
        inventory = _normalizar_inventario(inventory_raw)

        machine_raw = _pick(raw, "machine", default={})
        if not isinstance(machine_raw, dict):
            machine_raw = {}
        machine = {
            "hostname": _as_text(_pick(machine_raw, "hostname", "host", "name")),
            "ip": _as_text(_pick(machine_raw, "ip", "ipAddress", "ip_address")),
            "os": _as_text(_pick(machine_raw, "os", "platform", "system")),
            "arch": _as_text(_pick(machine_raw, "arch", "architecture")),
            "cpus": machine_raw.get("cpus"),
            "memory_gb": _pick(machine_raw, "memoryGb", "memory_gb"),
            "uptime_seconds": _pick(
                machine_raw, "uptimeSeconds", "uptime_seconds"
            ),
        }
        watch = _pick(config, "watch", "vigilancia", "watchlist", "watching", default=[])
        if isinstance(watch, (list, tuple)):
            watch = [_as_text(w) for w in watch if w]
        else:
            watch = []

        impacto_bajo = [f["impacto"].lower() for f in findings]
        afectan = sum(
            1
            for impacto in impacto_bajo
            if any(k in impacto for k in ("affected", "confirm", "afect"))
        )
        urgentes = sum(1 for f in findings if f["nivel"] in ("Actuar ya", "Alta"))
        kev = sum(1 for f in findings if f["kev"])

        findings.sort(
            key=lambda f: (
                f["prioridad"] is None,
                -(f["prioridad"] or 0),
                -(f["cvss"] or 0),
            )
        )

        return {
            "last_sync": _pick(
                raw,
                "lastSyncAt",
                "last_sync_at",
                "lastSync",
                "last_sync",
                "updatedAt",
                "generatedAt",
            ),
            "stats": {
                "total": len(findings),
                "afectan": afectan,
                "urgentes": urgentes,
                "kev": kev,
                "actualizaciones": len(updates),
                "inventario": len(inventory),
            },
            "stats_raw": _pick(raw, "stats", "estadisticas", default={}),
            "findings": findings,
            "updates": updates,
            "inventory": inventory,
            "hosts": _normalizar_hosts(raw),
            "inventory_mode": _as_text(raw.get("inventory_mode") or "declarado"),
            "machine": machine,
            "watch": watch,
        }
