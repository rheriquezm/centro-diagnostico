# Configuración

Toda la configuración es por **variables de entorno** (`.env`). Nunca hay
secretos en el código ni en el frontend.

| Variable | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `APP_NAME` | Nombre de la aplicación. | `Centro de Diagnostico` |
| `ENVIRONMENT` | `development` / `production`. | `development` |
| `SECRET_KEY` | Clave para firmar JWT (genera una aleatoria). | `<aleatoria>` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Vigencia del token. | `480` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciales PostgreSQL. | `centro` / `***` / `centro_diagnostico` |
| `DATABASE_URL` | Cadena de conexión (la arma compose). | `postgresql+psycopg2://...` |
| `BACKEND_PORT` / `FRONTEND_PORT` | Puertos publicados. | `8000` / `3000` |
| `NEXT_PUBLIC_API_URL` | URL del backend vista por el navegador. | `http://localhost:8000` |
| `CORS_ORIGINS` | Orígenes permitidos (coma). | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | Client ID OAuth (producción). | `...apps.googleusercontent.com` |
| `ALLOWED_EMAILS_FILE` | Whitelist de correos. | `allowed_emails.json` |
| `DEV_LOGIN_ENABLED` | Habilita login de desarrollo (solo dev). | `false` |
| `REDMINE_URL` | URL base de Redmine. | `https://www.guadaltel.es/redmine` |
| `REDMINE_API_KEY` | API key de **solo lectura**. | `***` |
| `REDMINE_PROJECT_ID` | Proyecto(s) a analizar (vacío = todos). | `903` |
| `REDMINE_VERIFY_SSL` / `REDMINE_TIMEOUT` | TLS / timeout. | `true` / `60` |
| `GRAYLOG_URL` | URL base de Graylog. | `https://adp.serviciocivil.cl/graylog` |
| `GRAYLOG_USER` / `GRAYLOG_PASSWORD` | Usuario de **solo lectura**. | `***` |
| `GRAYLOG_API_TOKEN` | Alternativa a usuario/password. | `***` |
| `GRAYLOG_STREAMS` | Streams a consultar (coma). | `Aplicaciones log` |
| `GRAYLOG_VERIFY_SSL` / `GRAYLOG_TIMEOUT` | TLS / timeout. | `true` / `60` |
| `AI_PROVIDER` | `none`/`openai`/`gemini`/`ollama`. | `none` |
| `AI_MODEL` / `AI_API_KEY` / `AI_BASE_URL` | Config del proveedor IA. | — |
| `SYNC_LOOKBACK_HOURS` | Ventana por defecto de sincronización. | `24` |
| `FINGERPRINT_SAMPLES` | Muestras guardadas por fingerprint. | `5` |
| `SCHEDULER_ENABLED` | Activa el cron interno. | `true` |
| `SYNC_INTERVAL_MINUTES` | Frecuencia del cron. | `60` |
| `YALE_BASE_URL` | API Yale Connect. | `https://api.connectservices.assaabloy.com/api/YaleConnect/` |
| `YALE_EMAIL` / `YALE_PASSWORD` | Credenciales de la cuenta Yale Connect. | `***` |
| `YALE_HOME_ID` | Hogar a analizar (vacío = todos). | `211854` |
| `YALE_SYNC_DAYS` | Días de historial a sincronizar. | `7` |

## Notas importantes (según tu infraestructura)

- **Redmine**: el WAF bloquea `*.json` / `*.xml`. El conector DEBE usar
  `?format=json` (implementado en el diseño de FASE 2).
- **Graylog**: si el API Token no funciona, usa usuario/password (HTTP Basic).
  Recomendado: crear un **usuario de solo lectura**.
- **Volumen**: no se ingieren todos los logs; se **agregan** por fingerprint.

## Generar `SECRET_KEY`

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

## Motor de IA

El diagnóstico y el asistente pasan por una **interfaz plug-in** (`AIProvider`).
Opciones:

1. **`AI_PROVIDER=none`** — diagnóstico **heurístico** (sin LLM, rápido y sin costo).
2. **`AI_PROVIDER=ollama`** — LLM **local** (recomendado por datos institucionales):
   - Con el servicio incluido en Docker Compose:
     ```bash
     docker compose --profile llm up -d ollama
     docker compose exec -T ollama ollama pull llama3.2:1b
     ```
     y en `.env`: `AI_BASE_URL=http://ollama:11434`, `AI_MODEL=llama3.2:1b`.
   - Con Ollama en el **host** (Windows/macOS): `AI_BASE_URL=http://host.docker.internal:11434`.
3. **`AI_PROVIDER=openai`** — **ChatGPT** vía API compatible OpenAI:
   - En `.env`:
     ```
     AI_PROVIDER=openai
     AI_MODEL=gpt-4o-mini
     AI_API_KEY=sk-...
     AI_BASE_URL=https://api.openai.com/v1
     ```
   - Después: `docker compose up -d backend`.

### Límites (evitan cuelgues)
- `AI_TIMEOUT_SECONDS=90` — tiempo máximo; si se excede, **cae al motor heurístico**.
- `AI_MAX_OUTPUT_TOKENS=400` — **clave**: evita generaciones infinitas (Ollama generando sin parar y bloqueando su único *slot*).
- `AI_MAX_STACK_CHARS=1200` — acota el contexto enviado al modelo.

> Si el proveedor falla o no responde, el sistema **degrada automáticamente** al
> motor heurístico, sin romper la plataforma.

### Guardrails
- Solo se envía **contexto agregado** (nunca logs masivos).
- Salida JSON validada; **los IDs de ticket citados se verifican** contra la base.
- Diagnósticos etiquetados como **hipótesis** con `confidence`.
