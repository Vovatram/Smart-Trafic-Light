from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.mapping import to_intersection_config, to_phase_configs
from app.models import Intersection, RunStatus, SimulationMetric, SimulationRun
from app.schemas import MetricOut, RunControl, RunOut, RunStart
from app.sim.manager import manager

router = APIRouter(prefix="/api", tags=["simulation"])


@router.get("/runs", response_model=list[RunOut])
async def list_runs(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(SimulationRun).order_by(SimulationRun.started_at.desc()).limit(50)
    )
    return list(result.scalars())


@router.post("/intersections/{intersection_id}/runs", response_model=RunOut, status_code=201)
async def start_run(
    intersection_id: int,
    payload: RunStart,
    session: AsyncSession = Depends(get_session),
):
    intersection = await session.get(Intersection, intersection_id)
    if intersection is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "перекрёсток не найден")

    if payload.program_id is not None:
        program = next((p for p in intersection.programs if p.id == payload.program_id), None)
        if program is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, "программа не найдена у этого перекрёстка"
            )
    else:
        program = next((p for p in intersection.programs if p.is_active), None)
        if program is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "у перекрёстка нет активной программы"
            )

    # один перекрёсток — одна живая симуляция
    running = await session.execute(
        select(SimulationRun).where(
            SimulationRun.intersection_id == intersection_id,
            SimulationRun.status == RunStatus.RUNNING,
        )
    )
    for previous in running.scalars():
        await manager.stop(previous.id)

    run = SimulationRun(
        intersection_id=intersection_id,
        program_id=program.id,
        seed=payload.seed,
        status=RunStatus.RUNNING,
    )
    session.add(run)
    await session.commit()
    await session.refresh(run)

    manager.start(
        run.id,
        to_intersection_config(intersection),
        to_phase_configs(program),
        seed=payload.seed,
    )
    return run


@router.post("/runs/{run_id}/stop", response_model=RunOut)
async def stop_run(run_id: int, session: AsyncSession = Depends(get_session)):
    run = await session.get(SimulationRun, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "прогон не найден")
    await manager.stop(run_id)
    await session.refresh(run)
    return run


@router.patch("/runs/{run_id}", response_model=RunOut)
async def control_run(
    run_id: int, payload: RunControl, session: AsyncSession = Depends(get_session)
):
    run = await session.get(SimulationRun, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "прогон не найден")
    session_obj = manager.get(run_id)
    if session_obj is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "прогон не запущен")
    if payload.speed is not None:
        session_obj.speed = payload.speed
    if payload.paused is not None:
        session_obj.paused = payload.paused
    return run


@router.get("/runs/{run_id}/metrics", response_model=list[MetricOut])
async def run_metrics(run_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(SimulationMetric)
        .where(SimulationMetric.run_id == run_id)
        .order_by(SimulationMetric.sim_time, SimulationMetric.direction)
    )
    return list(result.scalars())


@router.websocket("/ws/runs/{run_id}")
async def run_stream(websocket: WebSocket, run_id: int):
    session_obj = manager.get(run_id)
    if session_obj is None:
        await websocket.close(code=4404, reason="прогон не запущен")
        return
    await websocket.accept()
    await session_obj.attach(websocket)
    try:
        while True:
            # входящие сообщения не обязательны; читаем, чтобы видеть разрыв соединения
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        session_obj.detach(websocket)
