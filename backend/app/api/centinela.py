from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.connectors.centinela import CentinelaClient, CentinelaError
from app.core.config import settings
from app.core.security import get_current_user
from app.services.ai.runner import structured

router = APIRouter(
    prefix="/centinela",
    tags=["centinela"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/test")
def test() -> dict:
    client = CentinelaClient()
    try:
        health = client.health()
    except CentinelaError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "url": client.base_url, "health": health}


@router.get("/summary")
def summary() -> dict:
    client = CentinelaClient()
    try:
        raw = client.state()
    except CentinelaError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    data = client.normalizar(raw)
    try:
        data["health"] = client.health()
    except CentinelaError:
        data["health"] = {}
    sync = raw.get("sync") or {}
    data["sync_status"] = sync.get("status")
    data["sources"] = sync.get("sources") or {}
    data["ok"] = True
    data["url"] = client.base_url
    data["public_url"] = settings.CENTINELA_PUBLIC_URL
    return data


@router.post("/sync")
def sync() -> dict:
    client = CentinelaClient()
    try:
        result = client.trigger_sync()
    except CentinelaError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, **result}

class PlanReq(BaseModel):
    host: str | None = None
    ip: str | None = None
    os: str | None = None
    software: str
    installed: str | None = None
    available: str | None = None
    criticality: int | None = None
    eol: str | None = None
    cve: str | None = None


SYSTEM_PLAN = (
    "Eres un experto en operaciones. Genera un plan de actualizacion en espanol simple. "
    "Usa SOLO los datos entregados; no inventes versiones, sitios, comandos ni proveedores. "
    "No menciones Microsoft ni otro proveedor si el servicio no es de ese proveedor. "
    "No incluyas descargas desde sitios web ni desinstalaciones innecesarias. "
    "Adapta al SO indicado: Windows (winget/choco o instalador) o Linux (apt/dnf/yum). "
    "Devuelve exactamente 5 pasos concretos, sin repetir. "
    "Responde UNICAMENTE JSON con: resumen (texto), pasos (5), verificacion (3), "
    "riesgos (3), respaldo (texto), ventana (texto), tiempo_estimado (texto corto)."
)


def _lista(value) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _plan_determinista(p: PlanReq) -> dict:
    sw = (p.software or "").lower()
    os_name = (p.os or "").lower()
    windows = "windows" in os_name
    gestor = (
        "el instalador oficial o winget/choco"
        if windows
        else "el gestor de paquetes del sistema (apt, dnf o yum)"
    )

    if "php" in sw:
        pasos = [
            "Respaldar la configuracion de PHP, el codigo del sitio y la base de datos.",
            "Verificar la version actual y las extensiones necesarias.",
            f"Actualizar PHP y sus extensiones usando {gestor}.",
            "Reiniciar PHP-FPM y el servidor web.",
            "Validar el sitio, el inicio de sesion y los logs de errores.",
        ]
        verificacion = [
            "php -v muestra la version objetivo.",
            "El sitio responde y el login funciona.",
            "Sin errores nuevos en los logs.",
        ]
    elif "mysql" in sw:
        pasos = [
            "Respaldar la base de datos completa y la configuracion del servidor.",
            "Detener temporalmente la aplicacion que usa la base de datos.",
            "Actualizar MySQL a la version soportada.",
            "Iniciar el servicio y validar conexiones y usuarios.",
            "Verificar integridad de datos y rendimiento.",
        ]
        verificacion = [
            "El servicio MySQL esta activo.",
            "La aplicacion conecta correctamente.",
            "Sin errores en el log de MySQL.",
        ]
    elif "joomla" in sw or "wordpress" in sw:
        pasos = [
            "Respaldar archivos, configuracion y base de datos del sitio.",
            "Activar el modo mantenimiento.",
            "Actualizar el nucleo a la version disponible y luego extensiones/plugins.",
            "Verificar compatibilidad de plantilla y extensiones.",
            "Desactivar mantenimiento y validar el sitio.",
        ]
        verificacion = [
            "El panel de administracion carga.",
            "Las extensiones/plugins estan actualizadas.",
            "El sitio publico responde correctamente.",
        ]
    elif "node" in sw:
        pasos = [
            "Respaldar el codigo, la configuracion y las dependencias.",
            "Actualizar Node.js a la version soportada.",
            "Reinstalar dependencias y ejecutar las pruebas.",
            "Reiniciar la aplicacion y validar su salud.",
            "Revisar logs y rendimiento.",
        ]
        verificacion = [
            "node -v muestra la version objetivo.",
            "La aplicacion responde en su puerto.",
            "Sin errores en los logs.",
        ]
    else:
        pasos = [
            "Respaldar configuracion, datos y estado actual del servicio.",
            f"Actualizar el servicio usando {gestor}.",
            "Reiniciar el servicio y validar su estado.",
            "Revisar logs y funcionalidad principal.",
        ]
        verificacion = [
            "El servicio esta activo.",
            "La funcionalidad principal responde.",
            "Sin errores nuevos en los logs.",
        ]

    return {
        "resumen": (
            f"Actualizacion de {p.software} de {p.installed or 'la version actual'} "
            f"a {p.available or 'la version soportada'} en {p.host or 'el servidor'}."
        ),
        "pasos": pasos,
        "verificacion": verificacion,
        "riesgos": [
            "Interrupcion breve del servicio durante el reinicio.",
            "Incompatibilidad con extensiones, plugins o dependencias.",
            "Necesidad de revertir si la validacion falla.",
        ],
        "respaldo": (
            "Realizar respaldo completo de configuracion, codigo y datos antes de iniciar."
        ),
        "ventana": "Fuera del horario habil, con aviso previo a los usuarios.",
        "tiempo_estimado": "30 a 60 minutos",
    }


_PLAN_CACHE: dict[str, dict] = {}


def _plan_cache_key(p: PlanReq) -> str:
    return f"{p.software}|{p.installed}|{p.available}|{p.os}"


def _plan_user(p: PlanReq) -> str:
    return (
        f"Host: {p.host or '-'}\nIP: {p.ip or '-'}\n"
        f"SO: {p.os or '-'}\nServicio: {p.software}\n"
        f"Version instalada: {p.installed or '-'}\n"
        f"Version disponible: {p.available or '-'}\n"
        f"Criticidad: {p.criticality if p.criticality is not None else '-'}\n"
        f"EOL: {p.eol or '-'}\nCVE: {p.cve or '-'}"
    )


def _normalizar_plan(result: dict) -> dict:
    result = result or {}
    result["pasos"] = _lista(result.get("pasos"))
    result["verificacion"] = _lista(result.get("verificacion"))
    result["riesgos"] = _lista(result.get("riesgos"))
    result.setdefault("resumen", "")
    result.setdefault("respaldo", "")
    result.setdefault("ventana", "")
    result.setdefault("tiempo_estimado", "")
    if len(str(result.get("tiempo_estimado") or "")) > 40:
        result["tiempo_estimado"] = "30 a 60 minutos"
    return result


@router.post("/plan")
def plan(payload: PlanReq) -> dict:
    """Plan inmediato por reglas (no bloquea esperando la IA)."""
    result = _plan_determinista(payload)
    result["provider"] = "reglas (rapido)"
    return result


@router.post("/plan-ia")
def plan_ia(payload: PlanReq) -> dict:
    """Plan mejorado con IA; se cachea para las siguientes consultas."""
    cache_key = _plan_cache_key(payload)
    if cache_key in _PLAN_CACHE:
        return _PLAN_CACHE[cache_key]

    user = _plan_user(payload)
    result, used = structured(
        SYSTEM_PLAN, user, user, "ollama", timeout_ollama=75
    )
    result = _normalizar_plan(result)
    if not result["pasos"]:
        result = _plan_determinista(payload)
        used = "respaldo (sin IA)"
    result["provider"] = used
    if len(_PLAN_CACHE) > 200:
        _PLAN_CACHE.clear()
    _PLAN_CACHE[cache_key] = result
    return result
