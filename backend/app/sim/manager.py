"""Запуск симуляций в фоне и раздача кадров по WebSocket."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import datetime, timezone

from fastapi import WebSocket
from sqlalchemy import update

from app.config import get_settings
from app.db import SessionLocal
from app.geometry import IntersectionConfig
from app.models import Direction, RunStatus, SimulationMetric, SimulationRun
from app.sim.engine import PhaseConfig, Simulation

logger = logging.getLogger(__name__)
settings = get_settings()

METRICS_PERIOD_S = 10.0  # как часто писать статистику в БД (модельное время)


class SimulationSession:
    """Одна запущенная симуляция: цикл расчёта + подписчики."""

    def __init__(
        self,
        run_id: int,
        config: IntersectionConfig,
        phases: list[PhaseConfig],
        seed: int = 0,
    ) -> None:
        self.run_id = run_id
        self.simulation = Simulation(config, phases, seed)
        self.clients: set[WebSocket] = set()
        self.speed = 1
        self.paused = False
        self._task: asyncio.Task | None = None
        self._next_metrics_at = METRICS_PERIOD_S

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop(), name=f"sim-{self.run_id}")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        for client in list(self.clients):
            with contextlib.suppress(Exception):
                await client.close()
        self.clients.clear()

    async def attach(self, websocket: WebSocket) -> None:
        self.clients.add(websocket)
        await websocket.send_json(self.simulation.layout())
        await websocket.send_json(self.simulation.snapshot())

    def detach(self, websocket: WebSocket) -> None:
        self.clients.discard(websocket)

    async def _loop(self) -> None:
        loop = asyncio.get_running_loop()
        dt = 1.0 / settings.sim_tick_hz
        broadcast_every = max(1, round(settings.sim_tick_hz / settings.sim_broadcast_hz))
        tick = 0
        next_at = loop.time()
        try:
            while True:
                if not self.paused:
                    for _ in range(self.speed):
                        self.simulation.step(dt)
                    tick += 1
                    if tick % broadcast_every == 0:
                        await self._broadcast(self.simulation.snapshot())
                    if self.simulation.time >= self._next_metrics_at:
                        self._next_metrics_at += METRICS_PERIOD_S
                        await self._persist_metrics()
                next_at += dt
                await asyncio.sleep(max(0.0, next_at - loop.time()))
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — цикл не должен падать молча
            logger.exception("симуляция %s остановлена из-за ошибки", self.run_id)

    async def _broadcast(self, payload: dict) -> None:
        dead: list[WebSocket] = []
        for client in list(self.clients):
            try:
                await client.send_json(payload)
            except Exception:  # noqa: BLE001 — клиент отвалился
                dead.append(client)
        for client in dead:
            self.clients.discard(client)

    async def _persist_metrics(self) -> None:
        stats = self.simulation.stats()
        sim_time = round(self.simulation.time, 2)
        try:
            async with SessionLocal() as session:
                session.add_all(
                    [
                        SimulationMetric(
                            run_id=self.run_id,
                            sim_time=sim_time,
                            direction=Direction(direction),
                            queue_length=int(values["queue"]),
                            avg_wait_s=float(values["avg_wait"]),
                            departed=int(values["departed"]),
                        )
                        for direction, values in stats.items()
                    ]
                )
                await session.execute(
                    update(SimulationRun)
                    .where(SimulationRun.id == self.run_id)
                    .values(sim_duration_s=sim_time)
                )
                await session.commit()
        except Exception:  # noqa: BLE001 — потеря метрик не должна ронять симуляцию
            logger.exception("не удалось записать метрики прогона %s", self.run_id)


class SimulationManager:
    def __init__(self) -> None:
        self._sessions: dict[int, SimulationSession] = {}

    def get(self, run_id: int) -> SimulationSession | None:
        return self._sessions.get(run_id)

    def active(self) -> list[int]:
        return sorted(self._sessions)

    def start(
        self,
        run_id: int,
        config: IntersectionConfig,
        phases: list[PhaseConfig],
        seed: int = 0,
    ) -> SimulationSession:
        session = SimulationSession(run_id, config, phases, seed)
        self._sessions[run_id] = session
        session.start()
        return session

    async def stop(self, run_id: int) -> bool:
        session = self._sessions.pop(run_id, None)
        if session is None:
            return False
        await session.stop()
        async with SessionLocal() as db:
            await db.execute(
                update(SimulationRun)
                .where(SimulationRun.id == run_id)
                .values(status=RunStatus.STOPPED, stopped_at=datetime.now(timezone.utc))
            )
            await db.commit()
        return True

    async def shutdown(self) -> None:
        for run_id in list(self._sessions):
            await self.stop(run_id)


manager = SimulationManager()
