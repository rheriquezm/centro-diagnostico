# Arquitectura

## Vista general

```
Next.js (TS + Tailwind)
        │  REST (JWT)
        ▼
FastAPI  ──►  Motor de Análisis / Correlación
   │                 │                │
   │         Redmine Connector   Graylog Connector
   │                 │                │
   ▼                 ▼                ▼
PostgreSQL   (agregados + KB)   Redmine API / Graylog API
   │
   ▼
AI Analysis Service (interfaz plug-in)
```

## Decisión clave: agregar, no copiar

Graylog puede generar **cientos de miles de mensajes/día**. La plataforma:

1. consulta Graylog por **ventana de tiempo**;
2. **normaliza** y **agrupa por fingerprint**;
3. guarda **solo agregados** (conteo por fingerprint × hora × host) y **N
   muestras**;
4. la IA recibe **contexto reducido** (decenas de problemas), nunca logs masivos.

Esto reduce costo de IA, tamaño de base de datos y tiempo de respuesta.

## Componentes

| Componente | Responsabilidad |
| :--- | :--- |
| `connectors/redmine.py` | API Redmine (`?format=json` + `X-Redmine-API-Key`). |
| `connectors/graylog.py` | API Graylog (`Authorization`); consulta por rango. |
| `services/fingerprint.py` | Normalización + template + hash (`error_fingerprint`). |
| `services/correlation.py` | Puntaje de similitud log ↔ ticket + evidencia. |
| `services/analysis.py` | Agregaciones, tendencias, hallazgos. |
| `services/ai/` | Interfaz `AIProvider` + implementaciones. |
| `services/kb.py` | Base de conocimiento. |
| `api/*` | Routers REST. |

## Flujo

```
[Job programado]
  Graylog  → normalizar → fingerprint → buckets(hora×host) + muestras
  Redmine  → tickets + journals + relaciones

[Problemas / Correlaciones]
  fingerprints → correlación con tickets → hallazgos
  (nuevos · sin_ticket · reincidencia · recurrente)

[Diagnóstico IA]
  contexto (fingerprint + métricas + tickets) → AIProvider → JSON validado
  → causa probable + recomendaciones + confianza + "cómo verificar"
```

## Fingerprinting

`error_fingerprint = sha1(app | servicio | exception_type | clase | método | línea | template[:200])`

Normalización de variables: UUID, IP, email, hex, timestamps, números → placeholders.
Así `usuario=123 ReclamacionJob.java:180` y `usuario=859 ReclamacionJob.java:180`
son **el mismo problema**. Los patrones viven en la tabla `patterns` (editable
sin tocar código).

## Correlación (similitud, no causalidad)

Score interpretable (0–100 %) combinando: exception_type / clase / método,
similitud de tokens (TF-IDF/coseno), aplicación/servicio y proximidad temporal.
**Siempre se muestra la evidencia** y se etiqueta como *similitud de
información*.

**Caso crítico:** ticket `Cerrado` + ocurrencias posteriores a `closed_on` →
`POSIBLE REINCIDENCIA`.

## Guardrails de IA

1. Solo contexto estructurado y reducido.
2. Salida forzada a JSON validado con Pydantic.
3. Anclaje: se validan los IDs de ticket citados contra la base de datos.
4. Las cifras provienen del backend, no del modelo.
5. Se separa “datos de los sistemas” de “análisis IA”.
6. `confidence` + lenguaje de hipótesis. **No crea tickets** (solo borrador).
7. Se guarda `prompt_version` + `input_hash` para auditoría.

## Modelo de datos (resumen)

`tickets`, `ticket_journals`, `ticket_relations`, `error_fingerprints`,
`error_buckets`, `correlations`, `findings`, `kb_entries`, `ai_diagnoses`,
`sync_runs`, `patterns`.
