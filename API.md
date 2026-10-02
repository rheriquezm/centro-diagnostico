# API

Base: `http://localhost:8000`. Documentación interactiva: `/docs`.

## Observabilidad (público)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| GET | `/health` | Liveness. Devuelve `{status, app, env}`. |
| GET | `/ready` | Readiness. Verifica la base de datos. |

## Autenticación

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| POST | `/api/auth/google` | `{id_token}` → valida Google + whitelist → `{access_token, user}`. |
| POST | `/api/auth/dev-login` | `{email}` → JWT (solo si `DEV_LOGIN_ENABLED=true`). |
| GET | `/api/auth/me` | Usuario del token. |

Todas las rutas siguientes requieren `Authorization: Bearer <token>`.

## Sistema

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| GET | `/api/system/status` | Estado de BD, conectores (Redmine/Graylog) y motor IA. |

## Dashboard

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| GET | `/api/dashboard/summary` | KPIs: errores 24 h / 7 d / críticos, tickets abiertos/cerrados, sin ticket, reincidencias, nuevos, correlaciones. |
| GET | `/api/dashboard/trend?days=7` | Serie diaria de errores. |

## Cerradura Yale Connect (ASSA ABLOY)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| GET | `/api/yale/test` | Valida credenciales y lista hogares. |
| POST | `/api/yale/sync?days=7` | Sincroniza registros de acceso (aperturas/cierres). |
| GET | `/api/yale/records?dias=7&puerta=&usuario=&estado=` | Registros de acceso filtrados. |
| GET | `/api/yale/resumen?dias=7` | Aperturas/cierres, por usuario, por puerta y por hora. |

## Próximas fases

- **FASE 2** — `/api/redmine/*` (sincronización y consulta de tickets).
- **FASE 3** — `/api/graylog/*` (consulta, normalización, fingerprints).
- **FASE 4** — `/api/problems`, `/api/correlations`, `/api/findings`.
- **FASE 5** — `/api/ai/diagnose`, `/api/assistant/ask`.
- **FASE 6** — `/api/continuous`, `/api/knowledge`, `/api/search`.

## Ejemplos

```bash
# Health
curl http://localhost:8000/health

# Login de desarrollo
curl -X POST http://localhost:8000/api/auth/dev-login \
  -H "Content-Type: application/json" \
  -d '{"email":"rhenriquez@serviciocivil.cl"}'

# Dashboard (con token)
curl http://localhost:8000/api/dashboard/summary \
  -H "Authorization: Bearer <token>"
```
