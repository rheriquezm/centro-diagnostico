# Troubleshooting

## El backend no levanta / reinicia en bucle

```bash
docker compose logs backend --tail 50
```

- Error de conexión a la base de datos: espera a que `db` esté `healthy`
  (`docker compose ps`). El backend depende de ese healthcheck.
- Error de variables: revisa `.env` contra `.env.example`.

## `/ready` responde 500

La base de datos no responde. Verifica:

```bash
docker compose logs db --tail 50
docker compose exec db pg_isready -U $POSTGRES_USER -d $POSTGRES_DB
```

## El frontend no muestra datos (401)

- No has iniciado sesión: abre http://localhost:8011/login.
- `DEV_LOGIN_ENABLED` está en `false` y no hay Google OAuth: ponlo en `true`
  solo en desarrollo.

## El navegador no alcanza el backend

`NEXT_PUBLIC_API_URL` debe ser accesible **desde el navegador**, no desde el
contenedor. En local: `http://localhost:8010`. Si usas otro host, ajusta CORS
(`CORS_ORIGINS`).

## Redmine responde 403 (FASE 2)

El WAF corporativo bloquea `https://.../issues.json`. Usa `?format=json`:
`https://.../issues?format=json&limit=1`. El conector ya lo hace así.

## Graylog responde 401 (FASE 3)

- El API Token puede ser inválido (revisa en Graylog → System → Users → Tokens).
- Alternativa: `GRAYLOG_USER` + `GRAYLOG_PASSWORD` (HTTP Basic).
- Verifica con: `curl -u usuario:pass https://<graylog>/api/system`.

## Puertos ocupados

Cambia `BACKEND_PORT` / `FRONTEND_PORT` en `.env` y `docker compose up -d`.

## Reiniciar limpio

```bash
docker compose down            # conserva datos
docker compose down -v         # BORRA la base de datos
docker compose up -d --build
```
