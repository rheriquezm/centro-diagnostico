# Centro de Diagnóstico y Mejora Continua

Plataforma operacional que **correlaciona Graylog y Redmine** para detectar
problemas, medir reincidencias, generar diagnósticos asistidos por IA y hacer
seguimiento / mejora continua.

No es solo un dashboard: responde *qué está fallando, desde cuándo, cuántas
veces, qué sistema está afectado, si hay ticket, si el ticket se cerró pero el
error continúa, causa probable, qué revisar y cómo verificar la solución*.

## Stack

| Capa | Tecnología |
| :--- | :--- |
| Frontend | Next.js 14 + TypeScript + Tailwind CSS (modo oscuro) |
| Backend | Python 3.11 + FastAPI |
| Base de datos | PostgreSQL 16 |
| Integraciones | Redmine REST API · Graylog REST API · Yale Connect · ZKBio CVAccess |
| IA | Interfaz plug-in (`none`/`openai`/`gemini`/`ollama`) |
| Despliegue | Docker + Docker Compose |

## Inicio rápido

```bash
cp .env.example .env      # completa credenciales (ver CONFIGURATION.md)
docker compose up -d
```

- Frontend: http://localhost:3000
- Backend:  http://localhost:8000/docs
- Health:   http://localhost:8000/health  ·  Ready: http://localhost:8000/ready

## IA (opcional, local)

Por defecto `AI_PROVIDER=none` (diagnóstico heurístico). Para usar un LLM local:

```bash
docker compose --profile llm up -d ollama
docker compose exec -T ollama ollama pull llama3.2:1b
# en .env: AI_PROVIDER=ollama  AI_MODEL=llama3.2:1b  AI_BASE_URL=http://ollama:11434
docker compose up -d backend
```

Detalle en [CONFIGURATION.md](CONFIGURATION.md).

## Despliegue (producción)

Guía completa en [DEPLOYMENT.md](DEPLOYMENT.md). Resumen:

```bash
cp .env.example .env      # SECRET_KEY, DATABASE_URL, CORS_ORIGINS e integraciones
# DEV_LOGIN_ENABLED=false   ALLOWED_DOMAINS=tu-dominio.cl
docker compose up -d --build
```

- Backend en `BACKEND_PORT` (por defecto 8000; esta instancia usa **8100**).
- Frontend en `FRONTEND_PORT` (3000).
- Ponlo detrás de HTTPS (reverse proxy) y ajusta `CORS_ORIGINS` y `NEXT_PUBLIC_API_URL`.

## Documentación

- [DEPLOYMENT.md](DEPLOYMENT.md) — despliegue en producción (Docker, proxy, backups).
- [ARCHITECTURE.md](ARCHITECTURE.md) — diseño y componentes.
- [INSTALLATION.md](INSTALLATION.md) — instalación paso a paso.
- [CONFIGURATION.md](CONFIGURATION.md) — variables de entorno.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — problemas frecuentes.
- [SECURITY.md](SECURITY.md) — seguridad y manejo de secretos.
- [API.md](API.md) — endpoints.

## Estado (fases)

| Fase | Alcance | Estado |
| :--- | :--- | :--- |
| 1 | Estructura, Docker, DB, backend, frontend, dashboard, health | ✅ |
| 2 | Redmine Connector + tickets | ✅ |
| 3 | Graylog Connector + normalización + fingerprinting | ✅ |
| 4 | Correlation Engine + Problemas + sin ticket + reincidencias | ✅ |
| 5 | IA (diagnóstico, recomendaciones, asistente) | ✅ (heurístico; LLM opcional) |
| 6 | Mejora Continua + Base de Conocimiento + buscador | ✅ |

### Endpoints por fase

- **Redmine:** `/api/redmine/test`, `/projects`, `POST /sync`, `/tickets`.
- **Graylog:** `/api/graylog/test`, `/streams`, `POST /sync`, `/fingerprints`.
- **Cerradura Yale (ASSA ABLOY):** `/api/yale/test`, `POST /sync`, `/records`, `/resumen` (aperturas/cierres por usuario, puerta y hora; se sincroniza cada 60 min).
- **Control de Acceso ZKBio (ZKTeco):** `/api/zkbio/test`, `POST /sync`, `/records`, `/resumen` (eventos de acceso por usuario, dispositivo y hora, incluyendo el número de tarjeta; se sincroniza cada 60 min).
- **Correlación/hallazgos:** `POST /api/pipeline/run`, `/api/problems`, `/api/correlations`, `/api/findings`.
- **IA:** `POST /api/ai/diagnose`, `POST /api/assistant/ask`.
- **Mejora continua / KB / buscador:** `/api/continuous/indicators`, `/api/knowledge`, `/api/search`.

> La correlación y el umbral de fingerprinting son **configurables y ajustables**:
> el motor prioriza coincidencias de componente (excepción/clase/método) y
> palabras clave ponderadas por IDF. La calidad mejora iterando con datos reales.


> En desarrollo se pueden usar datos MOCK **claramente marcados**. Nunca se
> muestran datos simulados como si provinieran de Graylog/Redmine.
