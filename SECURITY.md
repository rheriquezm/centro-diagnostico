# Seguridad

## Secretos

- **Nunca** en el código ni en el frontend. Solo en `.env` (ignorado por git).
- `.env.example` documenta las claves sin valores reales.
- Recomendado: usuario/API key de **solo lectura** en Redmine y Graylog.
- Los logs **no** registran passwords, tokens ni API keys.

## Autenticación y autorización

- Producción: **Google OAuth** validado contra `allowed_emails.json` (dominio
  institucional) → **JWT**.
- `DEV_LOGIN_ENABLED` permite login de desarrollo; **debe** estar en `false` en
  producción.
- Todos los endpoints de negocio están protegidos con `get_current_user`
  (`/health` y `/ready` son públicos para observabilidad).

## Entradas y salidas

- Validación de entrada con **Pydantic**.
- Sin interpolación directa de SQL (SQLAlchemy parametrizado).
- Prevención de **XSS**: React escapa por defecto; no se usa `dangerouslySetInnerHTML`.
- **CORS** restrictivo vía `CORS_ORIGINS`.

## Red y dependencias

- Timeouts explícitos en llamadas a Redmine/Graylog/IA.
- Reintentos con **backoff**.
- **Rate limiting** y reintentos ante 429/5xx (FASES 2-3).

## Auditoría / observabilidad

- `sync_runs` y logs estructurados registran sincronizaciones y errores.
- No se registran datos sensibles.
- `/health` (liveness) y `/ready` (readiness con verificación de BD).

## Datos sensibles (ámbito público)

- Minimización y **anonimización** de IP/ID en el fingerprinting.
- La IA recibe **contexto agregado**, no logs crudos.
- Si se usa un modelo en la nube, evaluar **residencia de datos**; alternativa
  **local** (`AI_PROVIDER=ollama`).

## IA (guardrails)

- Salida estructurada validada; los IDs citados se verifican contra la BD.
- La IA **no** crea tickets: solo **borradores** con aprobación humana.
- Diagnósticos etiquetados como **hipótesis** con `confidence`; nunca como
  certeza.
