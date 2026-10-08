from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Centro de Diagnostico"
    ENVIRONMENT: str = "development"

    SECRET_KEY: str = "cambia-esta-clave-por-una-segura"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    DATABASE_URL: str = (
        "postgresql+psycopg2://centro:centro_pass@db:5432/centro_diagnostico"
    )

    CORS_ORIGINS: str = "http://localhost:3000"

    GOOGLE_CLIENT_ID: str = ""
    ALLOWED_EMAILS_FILE: str = "allowed_emails.json"
    ALLOWED_DOMAINS: str = ""
    DEV_LOGIN_ENABLED: bool = False

    REDMINE_URL: str = "https://www.guadaltel.es/redmine"
    REDMINE_API_KEY: str = ""
    REDMINE_PROJECT_ID: str = ""
    REDMINE_VERIFY_SSL: bool = True
    REDMINE_TIMEOUT: int = 60

    GRAYLOG_URL: str = "https://adp.serviciocivil.cl/graylog"
    GRAYLOG_API_TOKEN: str = ""
    GRAYLOG_USER: str = ""
    GRAYLOG_PASSWORD: str = ""
    GRAYLOG_VERIFY_SSL: bool = True
    GRAYLOG_TIMEOUT: int = 60
    GRAYLOG_STREAMS: str = ""

    AI_PROVIDER: str = "none"
    AI_MODEL: str = ""
    AI_API_KEY: str = ""
    AI_BASE_URL: str = ""
    AI_TIMEOUT_SECONDS: int = 90
    AI_MAX_OUTPUT_TOKENS: int = 400
    AI_MAX_STACK_CHARS: int = 1200
    AI_VERIFY_SSL: bool = True

    # Proveedor ChatGPT (OpenAI) - seleccionable por analisis
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Proveedor Claude (Anthropic) - seleccionable por analisis
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_BASE_URL: str = "https://api.anthropic.com/v1"
    ANTHROPIC_MODEL: str = "claude-3-5-sonnet-latest"

    # Proveedor Google Gemini (tier gratuito) - seleccionable por analisis
    GEMINI_API_KEY: str = ""
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta"
    GEMINI_MODEL: str = "gemini-3.5-flash"

    SYNC_LOOKBACK_HOURS: int = 24
    FINGERPRINT_SAMPLES: int = 5

    SCHEDULER_ENABLED: bool = True
    SYNC_INTERVAL_MINUTES: int = 60
    REDMINE_SYNC_MAX_ISSUES: int = 500
    GRAYLOG_SYNC_QUERY: str = "*"
    GRAYLOG_SYNC_RANGE_HOURS: int = 24
    GRAYLOG_SYNC_MAX_MESSAGES: int = 2000

    YALE_BASE_URL: str = "https://api.connectservices.assaabloy.com/api/YaleConnect/"
    YALE_EMAIL: str = ""
    YALE_PASSWORD: str = ""
    YALE_HOME_ID: str = ""
    YALE_BRAND_GUID: str = (
        "A46A26A6-2AE7-11ED-A261-0242AC120002."
        "3939e0f2-08e5-4bb1-b3a6-ddb1183666d3"
    )
    YALE_VERIFY_SSL: bool = True
    YALE_TIMEOUT: int = 40
    YALE_SYNC_DAYS: int = 7

    ZKBIO_BASE_URL: str = "http://accesos.serviciocivil.cl:8098"
    ZKBIO_USERNAME: str = "admin"
    ZKBIO_PASSWORD: str = ""
    ZKBIO_TIMEOUT: int = 60
    ZKBIO_SYNC_DAYS: int = 7
    ZKBIO_PAGE_SIZE: int = 200000

    NAGIOS_URL: str = "https://adp.serviciocivil.cl/nagios/cgi-bin"
    NAGIOS_USER: str = ""
    NAGIOS_PASSWORD: str = ""
    NAGIOS_VERIFY_SSL: bool = False
    NAGIOS_TIMEOUT: int = 40

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def graylog_streams(self) -> list[str]:
        return [s.strip() for s in self.GRAYLOG_STREAMS.split(",") if s.strip()]

    @property
    def allowed_domains(self) -> list[str]:
        return [
            d.strip().lower().lstrip("@")
            for d in self.ALLOWED_DOMAINS.split(",")
            if d.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
