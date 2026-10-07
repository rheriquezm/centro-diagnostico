import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    ai,
    auth,
    continuous,
    dashboard,
    graylog,
    health,
    knowledge,
    nagios,
    pipeline,
    problems,
    redmine,
    search,
    system,
    yale,
    zkbio,
)
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.db import models  # noqa: F401  (registra los modelos)
from app.db.database import Base, engine
from app.services.scheduler import start_scheduler

configure_logging()
logger = logging.getLogger("centro")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    start_scheduler()
    logger.info(
        "inicio app=%s env=%s ai=%s",
        settings.APP_NAME,
        settings.ENVIRONMENT,
        settings.AI_PROVIDER,
    )
    yield
    logger.info("detencion app=%s", settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="Centro de Diagnostico y Mejora Continua (Graylog + Redmine + IA).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "app": settings.APP_NAME,
        "docs": "/docs",
        "health": "/health",
        "frontend": "http://localhost:3000",
    }


app.include_router(health.router)
app.include_router(auth.router, prefix="/api")
app.include_router(system.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(redmine.router, prefix="/api")
app.include_router(graylog.router, prefix="/api")
app.include_router(problems.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(continuous.router, prefix="/api")
app.include_router(knowledge.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(yale.router, prefix="/api")
app.include_router(zkbio.router, prefix="/api")
app.include_router(nagios.router, prefix="/api")
