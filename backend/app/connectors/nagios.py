import logging
import re
from collections import Counter
from urllib.parse import unquote

import requests

from app.core.config import settings

logger = logging.getLogger("centro.connectors.nagios")

# Estados de host (clases del HTML de Nagios)
HOST_STATES = {
    "HOSTUP": "UP",
    "HOSTDOWN": "DOWN",
    "HOSTUNREACHABLE": "UNREACHABLE",
    "PENDING": "PENDING",
}
# Orden de severidad (mayor = mas grave)
SEVERIDAD = {
    "CRITICAL": 4,
    "DOWN": 4,
    "UNREACHABLE": 3,
    "WARNING": 3,
    "UNKNOWN": 2,
    "PENDING": 1,
    "OK": 0,
    "UP": 0,
}


class NagiosError(Exception):
    pass


def _clean(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)
    for src, dst in (
        ("&nbsp;", " "),
        ("&amp;", "&"),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", '"'),
        ("&#39;", "'"),
    ):
        text = text.replace(src, dst)
    return re.sub(r"\s+", " ", text).strip()


class NagiosClient:
    """Conector Nagios Core (solo lectura) via status.cgi (HTML)."""

    def __init__(
        self,
        base_url: str | None = None,
        user: str | None = None,
        password: str | None = None,
        verify_ssl: bool | None = None,
        timeout: int | None = None,
    ):
        self.base_url = (base_url or settings.NAGIOS_URL).rstrip("/")
        self.user = user if user is not None else settings.NAGIOS_USER
        self.password = password if password is not None else settings.NAGIOS_PASSWORD
        self.verify = settings.NAGIOS_VERIFY_SSL if verify_ssl is None else verify_ssl
        self.timeout = timeout or settings.NAGIOS_TIMEOUT

    def is_configured(self) -> bool:
        return bool(self.user and self.password)

    def _html(self, style: str, hostgroup: str = "all") -> str:
        if not self.is_configured():
            raise NagiosError("Nagios no configurado (NAGIOS_USER/NAGIOS_PASSWORD)")
        url = f"{self.base_url}/status.cgi"
        try:
            response = requests.get(
                url,
                params={"hostgroup": hostgroup, "style": style},
                auth=(self.user, self.password),
                verify=self.verify,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise NagiosError(f"No se pudo conectar a Nagios: {exc}") from exc
        if response.status_code == 401:
            raise NagiosError("Nagios: credenciales invalidas (401)")
        if response.status_code >= 400:
            raise NagiosError(f"Nagios respondio {response.status_code}")
        return response.text

    def _segmentos(self, html: str, anchor: re.Pattern) -> list[tuple[re.Match, str]]:
        matches = list(anchor.finditer(html))
        salida = []
        for i, m in enumerate(matches):
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(html)
            salida.append((m, html[start:end]))
        return salida

    def hosts(self) -> list[dict]:
        html = self._html("hostdetail")
        anchor = re.compile(r"extinfo\.cgi\?type=1&host=([^'&]+)", re.I)
        status_re = re.compile(
            r"class='status(HOSTUP|HOSTDOWN|HOSTUNREACHABLE|PENDING)'[^>]*>\s*"
            r"(UP|DOWN|UNREACHABLE|PENDING)\b",
            re.I,
        )
        resultado: dict[str, dict] = {}
        for m, seg in self._segmentos(html, anchor):
            sm = status_re.search(seg)
            if not sm:
                continue
            host = unquote(m.group(1))
            if host in resultado:
                continue
            cells = re.findall(r"class='status(?:Even|Odd)'[^>]*>(.*?)</td>", seg, re.S)
            resultado[host] = {
                "host": host,
                "estado": HOST_STATES.get(sm.group(1).upper(), "?"),
                "salida": _clean(cells[-1]) if cells else "",
            }
        return list(resultado.values())

    def services(self) -> list[dict]:
        html = self._html("servicedetail")
        anchor = re.compile(r"extinfo\.cgi\?type=2&host=([^'&]+)&service=([^'&]+)'", re.I)
        status_re = re.compile(
            r"class='status(OK|WARNING|CRITICAL|UNKNOWN)'[^>]*>\s*"
            r"(OK|WARNING|CRITICAL|UNKNOWN)\b",
            re.I,
        )
        resultado: dict[tuple, dict] = {}
        for m, seg in self._segmentos(html, anchor):
            sm = status_re.search(seg)
            if not sm:
                continue
            host = unquote(m.group(1))
            servicio = unquote(m.group(2)).replace("+", " ")
            clave = (host, servicio)
            if clave in resultado:
                continue
            cells = re.findall(r"class='status(?:Even|Odd)'[^>]*>(.*?)</td>", seg, re.S)
            resultado[clave] = {
                "host": host,
                "servicio": servicio,
                "estado": sm.group(1).upper(),
                "salida": _clean(cells[-1]) if cells else "",
            }
        return list(resultado.values())

    def resumen(self) -> dict:
        hosts = self.hosts()
        services = self.services()

        host_counts = Counter(h["estado"] for h in hosts)
        svc_counts = Counter(s["estado"] for s in services)

        alertas = []
        for h in hosts:
            if h["estado"] in ("UP", "OK", "PENDING"):
                continue
            alertas.append({"tipo": "host", **h})
        for s in services:
            if s["estado"] == "OK":
                continue
            alertas.append({"tipo": "servicio", **s})

        alertas.sort(key=lambda a: (-SEVERIDAD.get(a["estado"], 0), a.get("host", "")))

        return {
            "hosts": hosts,
            "services": services,
            "host_counts": dict(host_counts),
            "service_counts": dict(svc_counts),
            "hosts_total": len(hosts),
            "services_total": len(services),
            "alertas": alertas,
            "problemas": len(alertas),
        }

    def test(self) -> dict:
        r = self.resumen()
        return {
            "hosts": r["hosts_total"],
            "services": r["services_total"],
            "problemas": r["problemas"],
        }
