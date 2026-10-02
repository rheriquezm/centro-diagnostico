from app.services.ai.base import AIProvider

REGLAS = [
    {
        "claves": ("arrayindexoutofbounds", "indexoutofbounds"),
        "causa": "Se intento acceder a un indice de una coleccion vacia o fuera de rango.",
        "solucion": "Validar que la coleccion no este vacia antes de acceder al indice.",
        "codigo": "if (resultados != null && !resultados.isEmpty()) {\n    Object r = resultados.get(0);\n} else {\n    // Registrar contexto y manejar sin resultados\n}",
    },
    {
        "claves": ("nullpointer",),
        "causa": "Se uso una referencia nula (objeto no inicializado).",
        "solucion": "Verificar la inicializacion y agregar validacion de nulo.",
        "codigo": "if (objeto != null) {\n    objeto.metodo();\n}",
    },
    {
        "claves": ("sqlexception", "dataaccess", "psqlexception"),
        "causa": "Error de acceso a base de datos (consulta, conexion o restriccion).",
        "solucion": "Revisar el SQL, la conectividad y las restricciones de integridad.",
        "codigo": None,
    },
    {
        "claves": ("timeout", "sockettimeout"),
        "causa": "Una operacion excedio el tiempo maximo de espera.",
        "solucion": "Revisar latencia de la dependencia y ajustar timeouts/reintentos.",
        "codigo": None,
    },
    {
        "claves": ("connection refused", "connectexception", "unknownhost", "connection reset"),
        "causa": "No fue posible establecer conexion con un servicio/host.",
        "solucion": "Verificar disponibilidad del destino, red y puerto.",
        "codigo": None,
    },
    {
        "claves": ("outofmemory",),
        "causa": "La JVM agoto la memoria asignada (heap).",
        "solucion": "Analizar consumo/fugas y ajustar el heap.",
        "codigo": None,
    },
    {
        "claves": ("authenticationexception", "accessdenied", "user not found", "unauthorized"),
        "causa": "Fallo de autenticacion/autorizacion (usuario inexistente o permisos).",
        "solucion": "Validar credenciales, vigencia y permisos del usuario.",
        "codigo": None,
    },
]


class HeuristicProvider(AIProvider):
    """Proveedor deterministico (sin LLM). Entrega diagnostico interpretable."""

    name = "heuristica"

    def diagnose(self, context: dict) -> dict:
        texto = " ".join(
            [
                str(context.get("exception") or ""),
                str(context.get("normalized_error") or ""),
                str(context.get("error") or ""),
                str(context.get("stack_trace") or ""),
            ]
        ).lower()

        regla = None
        for candidate in REGLAS:
            if any(key in texto for key in candidate["claves"]):
                regla = candidate
                break

        clase = context.get("class")
        metodo = context.get("method")
        linea = context.get("line")
        ubicacion = (
            f"{clase}.{metodo}" + (f":{linea}" if linea else "")
            if clase
            else "no determinada"
        )

        frecuencia = context.get("frequency") or 0
        tickets = context.get("related_tickets") or []

        confianza = 0.4
        if regla:
            confianza += 0.3
        if clase and metodo:
            confianza += 0.2
        if frecuencia >= 10:
            confianza += 0.1
        confianza = round(min(confianza, 0.95), 2)

        causas = (
            [regla["causa"]]
            if regla
            else ["No se pudo determinar automaticamente; requiere revision del stack trace."]
        )
        return {
            "summary": f"Problema en {ubicacion} con {frecuencia} ocurrencias registradas.",
            "technical_explanation": (
                f"Excepcion '{context.get('exception') or 'n/d'}' en "
                f"{context.get('application') or 'n/d'}/{context.get('service') or 'n/d'}. "
                f"Ultima ocurrencia: {context.get('last_seen')}."
            ),
            "probable_causes": causas,
            "recommended_checks": [
                "Revisar los eventos anteriores/posteriores en Graylog.",
                "Confirmar si hubo despliegues o cambios en la ventana del incidente.",
                "Validar datos de entrada y estado de dependencias.",
            ],
            "recommended_actions": [
                regla["solucion"]
                if regla
                else "Analizar el flujo y agregar manejo de error.",
                "Agregar validaciones y registro de contexto.",
            ],
            "provider_request": (
                f"Solicitar al proveedor analizar {ubicacion} y entregar plan de correccion."
                if tickets
                else "Evaluar si corresponde generar un ticket al proveedor."
            ),
            "severity_reasoning": (
                f"Severidad del evento: {context.get('severity')}. "
                f"Frecuencia: {frecuencia}. "
                f"Tickets relacionados: {len(tickets)}."
            ),
            "code_snippet": regla["codigo"] if regla else None,
            "confidence": confianza,
        }

    def answer(self, question: str, context: dict) -> dict:
        resumen = context.get("summary") or {}
        findings = context.get("findings") or []
        return {
            "answer": (
                "Respuesta basada en los datos disponibles (sin LLM). "
                f"Pregunta: '{question}'. "
                f"Problemas registrados: {resumen.get('fingerprints_total', 0)}. "
                f"Hallazgos: {len(findings)}."
            ),
            "references": [
                {"tipo": "resumen", "valor": resumen},
                {"tipo": "hallazgos", "valor": findings[:10]},
            ],
            "confidence": 0.5,
            "provider": self.name,
        }
