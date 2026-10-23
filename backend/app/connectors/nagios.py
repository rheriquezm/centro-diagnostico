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

    def _objectjson(self, params: dict) -> dict:
        url = f"{self.base_url}/objectjson.cgi"
        try:
            response = requests.get(
                url,
                params=params,
                auth=(self.user, self.password),
                verify=self.verify,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise NagiosError(f"No se pudo conectar a Nagios: {exc}") from exc
        if response.status_code >= 400:
            raise NagiosError(f"Nagios objectjson respondio {response.status_code}")
        return response.json()

    def host_objects(self) -> list[dict]:
        data = self._objectjson({"query": "hostlist", "details": "true"})
        hostlist = (data.get("data") or {}).get("hostlist") or {}
        objetos = []
        for nombre, h in hostlist.items():
            objetos.append(
                {
                    "name": nombre,
                    "address": h.get("address"),
                    "parents": h.get("parent_hosts") or [],
                    "children": h.get("child_hosts") or [],
                    "services": h.get("services") or [],
                }
            )
        return objetos

    def topologia(self) -> dict:
        objetos = self.host_objects()
        estados = {h["host"]: h["estado"] for h in self.hosts()}

        def _rol(nombre: str) -> tuple[int, str]:
            n = nombre.lower()
            if "balance" in n or n.startswith("lb"):
                return 0, "Entrada / Balanceador"
            if "bastion" in n or "jump" in n:
                return 9, "Acceso administrativo (bastión)"
            if "proxy" in n:
                return 1, "Proxy reverso"
            if "app" in n:
                return 2, "Aplicación"
            return 2, "Servidor"

        nodos = []
        for h in objetos:
            capa, rol = _rol(h["name"])
            nodos.append(
                {
                    "id": h["name"],
                    "nombre": h["name"],
                    "direccion": h["address"],
                    "estado": estados.get(h["name"]),
                    "servicios": len(h["services"]),
                    "capa": capa,
                    "rol": rol,
                }
            )

        tiene_parents = any(h["parents"] for h in objetos)
        conexiones = []
        if tiene_parents:
            for h in objetos:
                for padre in h["parents"]:
                    conexiones.append({"from": padre, "to": h["name"]})
        else:
            orden = sorted(
                (n for n in nodos if n["capa"] != 9),
                key=lambda x: (x["capa"], x["nombre"]),
            )
            for a, b in zip(orden, orden[1:]):
                conexiones.append({"from": a["id"], "to": b["id"]})

        return {
            "nodos": sorted(nodos, key=lambda x: (x["capa"], x["nombre"])),
            "conexiones": conexiones,
            "inferida": not tiene_parents,
            "nota": (
                "Topología inferida por rol (Nagios no define relaciones padre/hijo)."
                if not tiene_parents
                else "Topología según relaciones padre/hijo de Nagios."
            ),
        }

    def metricas(self) -> dict:
        services = self.services()
        hosts = self.hosts()
        hc = Counter(h["estado"] for h in hosts)
        sc = Counter(s["estado"] for s in services)

        por_host: dict[str, dict] = {}
        for s in services:
            host = s["host"]
            out = s.get("salida") or ""
            bajo = out.lower()
            nombre = (s.get("servicio") or "").lower()
            m = por_host.setdefault(
                host,
                {
                    "host": host,
                    "memoria_pct": None,
                    "swap_pct": None,
                    "cpu_pct": None,
                    "discos": [],
                },
            )
            if "memoria" in nombre or "memory" in bajo:
                pcts = re.findall(r"-\s*(\d+(?:\.\d+)?)%", out)
                if pcts:
                    m["memoria_pct"] = float(pcts[0])
                    if len(pcts) > 1:
                        m["swap_pct"] = float(pcts[1])
            if "cpu" in nombre:
                mm = re.search(r"cputotal[=:\s]+(\d+)", out, re.I)
                if mm:
                    m["cpu_pct"] = float(mm.group(1))
            if "filesystem" in nombre:
                mm = re.search(r"\((\d+(?:\.\d+)?)%\s*inode", out, re.I)
                if mm:
                    usado = round(100 - float(mm.group(1)), 1)
                    m["discos"].append(
                        {"nombre": s.get("servicio"), "usado_pct": usado}
                    )

        return {
            "hosts": hosts,
            "services": services,
            "host_counts": dict(hc),
            "service_counts": dict(sc),
            "treemap": [
                {
                    "host": s["host"],
                    "servicio": s["servicio"],
                    "estado": s["estado"],
                }
                for s in services
            ],
            "host_metrics": sorted(por_host.values(), key=lambda x: x["host"]),
        }

    def test(self) -> dict:
        r = self.resumen()
        return {
            "hosts": r["hosts_total"],
            "services": r["services_total"],
            "problemas": r["problemas"],
        }
