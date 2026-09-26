from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import intersections, simulation
from app.config import get_settings
from app.db import engine
from app.sim.manager import manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await manager.shutdown()
    await engine.dispose()


app = FastAPI(
    title="SmartTrafficLight API",
    version="0.1.0",
    summary="Симуляция перекрёстка со светофорным регулированием и 3D-визуализацией",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(intersections.router)
app.include_router(simulation.router)


@app.get("/api/health", tags=["service"])
async def health() -> dict[str, object]:
    return {"status": "ok", "active_runs": manager.active()}
