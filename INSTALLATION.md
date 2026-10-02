# Instalación

## Requisitos

- Docker + Docker Compose
- (Opcional) Git
- Funciona en **macOS Apple Silicon** y **Windows + Docker Desktop**.

## Pasos

1. Configurar variables de entorno:

   ```bash
   cp .env.example .env
   ```

   Edita `.env` (ver [CONFIGURATION.md](CONFIGURATION.md)). Como mínimo:
   - `SECRET_KEY` (genera una aleatoria).
   - `DEV_LOGIN_ENABLED=true` para probar localmente sin Google.
   - Redmine/Graylog cuando quieras integrarlos (FASES 2-3).

2. Levantar:

   ```bash
   docker compose up -d
   ```

3. Verificar:

   ```bash
   docker compose ps
   curl http://localhost:8010/health
   curl http://localhost:8010/ready
   ```

   Abre http://localhost:8011 e ingresa con `DEV_LOGIN_ENABLED=true`.

## Qué deberías ver

- `cd_db`, `cd_backend`, `cd_frontend` en estado `running` (db `healthy`).
- `GET /health` → `{"status":"ok",...}`.
- `GET /ready` → `{"status":"ready"}` (la base de datos responde).
- Dashboard en http://localhost:8011 con KPIs en 0 (no hay datos aún) y el
  estado de conexiones (Redmine/Graylog "Sin configurar").

## Si algo falla

- **Puerto ocupado** (8010/8011/5432): cámbialo en `.env`
  (`FRONTEND_PORT`, `BACKEND_PORT`) y `docker compose up -d`.
- **`/ready` falla**: revisa `docker compose logs db`, espera el `healthy`.
- **Frontend no conecta al backend**: `NEXT_PUBLIC_API_URL` debe apuntar al
  backend accesible desde el navegador (`http://localhost:8010`).
- Ver [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
```
