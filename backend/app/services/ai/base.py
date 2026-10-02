from abc import ABC, abstractmethod


class AIProvider(ABC):
    """Interfaz comun para proveedores de IA (desacopla el modelo)."""

    name: str = "base"

    @abstractmethod
    def diagnose(self, context: dict) -> dict:
        """Devuelve un diagnostico estructurado a partir de contexto reducido."""

    @abstractmethod
    def answer(self, question: str, context: dict) -> dict:
        """Responde una pregunta usando solo el contexto entregado."""
