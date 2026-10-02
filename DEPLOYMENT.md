# Despliegue en producción

Guía para desplegar el Centro de Diagnóstico y Mejora Continua en un servidor
con Docker. Para desarrollo local ver [INSTALLATION.md](INSTALLATION.md).

## 1. Requisitos

- Docker Engine 24+ y Docker Compose v2.
- Conectividad saliente a: Redmine, Graylog, Yale Connect y el controlador
  ZKBio CVAccess (según las integraciones que uses).
- (Recomendado) Dominio y certificado TLS para servir por HTTPS.

## 2. Variables de entorno

Copia el ejemplo y completa los valores:

```bash
cp .env.example .env
```

Mínimo imprescindible:

| Variable | Descripción |
| :--- | :--- |
| `SECRET_KEY` | Clave aleatoria para firmar JWT. Generar: `python -c "import secrets; print(secrets.token_urlsafe(48))"`. |
| `ENVIRONMENT` | `production`. |
| `POSTGRES_PASSWORD` | Contraseña de la base de datos. |
| `CORS_ORIGINS` | Origen(es) del frontend, p. ej. `https://diagnostico.midominio.cl`. |
| `NEXT_PUBLIC_API_URL` | URL del backend **vista por el navegador** (se hornea en el build). |
| `DEV_LOGIN_ENABLED` | `false` en producción. |
| `ALLOWED_DOMAINS` | Dominios de correo autorizados, p. ej. `serviciocivil.cl`. |
| `GOOGLE_CLIENT_ID` | Client ID de Google OAuth (login productivo). |

Credenciales de integración (solo lectura): `REDMINE_*`, `GRAYLOG_*`, `YALE_*`,
`ZKBIO_*`. Ver [CONFIGURATION.md](CONFIGURATION.md).

> `NEXT_PUBLIC_API_URL` se inyecta en tiempo de **build** del frontend. Si cambia
> el dominio del backend, hay que reconstruir la imagen del frontend.

## 3. Puesta en marcha

```bash
docker compose up -d --build
docker compose ps
curl http://localhost:8010/health   # ajusta al BACKEND_PORT
```

- Backend: `http://<host>:${BACKEND_PORT}` (por defecto 8010).
- Frontend: `http://<host>:${FRONTEND_PORT}` (por defecto 8011).
- Health: `/health` · Ready: `/ready` · Docs: `/docs`.

Las tablas se crean automáticamente al iniciar el backend
(`Base.metadata.create_all`).

## 4. IA (opcional)

Diagnóstico/asistente con LLM. Por datos institucionales se recomienda **Ollama local**:

```bash
docker compose --profile llm up -d ollama
docker compose exec -T ollama ollama pull llama3.2:1b
# en .env:
#   AI_PROVIDER=ollama
#   AI_MODEL=llama3.2:1b
#   AI_BASE_URL=http://ollama:11434
docker compose up -d backend
```

Alternativa ChatGPT (`AI_PROVIDER=openai`, `AI_API_KEY=...`). Si el proveedor
falla o excede `AI_TIMEOUT_SECONDS`, el sistema **degrada al motor heurístico**.

## 5. Sincronización automática

El scheduler interno corre cada `SYNC_INTERVAL_MINUTES` (por defecto 60) y
sincroniza Redmine, Graylog, Yale y ZKBio, además de correlación/hallazgos.

- Estado: `GET /api/scheduler/status`.
- Forzar ahora: `POST /api/scheduler/run-now`.

## 6. Reverse proxy (HTTPS)

Ejemplo nginx sirviendo frontend y backend bajo el mismo dominio:

```nginx
server {
    listen 443 ssl;
    server_name diagnostico.midominio.cl;

    ssl_certificate     /etc/letsencrypt/live/diagnostico.midominio.cl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/diagnostico.midominio.cl/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8011;   # FRONTEND_PORT
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8010;   # BACKEND_PORT
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Con este esquema usa `NEXT_PUBLIC_API_URL=https://diagnostico.midominio.cl` y
`CORS_ORIGINS=https://diagnostico.midominio.cl`.

## 7. Actualizaciones

```bash
git pull
docker compose build
docker compose up -d
```

Reconstruye siempre el **backend** al cambiar código Python y el **frontend**
si cambia `NEXT_PUBLIC_API_URL` o el código de la UI (la imagen es de producción).

## 8. Respaldo de la base de datos

```bash
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup_$(date +%F).sql
```

Restaurar:

```bash
cat backup.sql | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

## 9. Checklist de seguridad

- [ ] `SECRET_KEY` aleatoria y única.
- [ ] `DEV_LOGIN_ENABLED=false`.
- [ ] `ENVIRONMENT=production`.
- [ ] `.env` **nunca** versionado (ver [SECURITY.md](SECURITY.md)).
- [ ] HTTPS en el reverse proxy.
- [ ] Credenciales de integración de **solo lectura**.
- [ ] `ALLOWED_DOMAINS` acotado a los dominios institucionales.
- [ ] Backups programados de PostgreSQL.

## 10. Problemas frecuentes

Ver [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Los más comunes:

- **Puerto ocupado** (8010/8011/5432): ajusta `FRONTEND_PORT` /
  `BACKEND_PORT`.
- **Frontend no conecta al backend**: `NEXT_PUBLIC_API_URL` incorrecto o falta
  reconstruir el frontend.
- **CORS**: `CORS_ORIGINS` no coincide con el dominio real.
