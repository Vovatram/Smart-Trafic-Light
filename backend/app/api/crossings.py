from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import (
    Crossing,
    DeviceType,
    ItsDevice,
    SceneSnapshot,
    SignalCycle,
    SignalLogEntry,
    TrafficMetricSnapshot,
)
from app.schemas import (
    CrossingBrief,
    CrossingIn,
    CrossingOut,
    CrossingUpdate,
    ItsDeviceIn,
    ItsDeviceOut,
    ItsDeviceUpdate,
    SceneSnapshotIn,
    SceneSnapshotOut,
    SignalCycleIn,
    SignalCycleOut,
    SignalCycleUpdate,
    SignalLogEntryIn,
    SignalLogEntryOut,
    TrafficMetricSnapshotIn,
    TrafficMetricSnapshotOut,
)

router = APIRouter(prefix="/api", tags=["crossings"])

# для PATCH: какие поля вообще применимы к какому типу устройства
POLE_FIELDS = {"height", "rotation_deg", "fov_deg", "view_radius"}
LOOP_FIELDS = {"loop_length"}
CAMERA_ONLY_FIELDS = {"stream_url"}


async def _load(session: AsyncSession, crossing_id: int) -> Crossing:
    crossing = await session.get(Crossing, crossing_id)
    if crossing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "переход не найден")
    return crossing


async def _load_device(session: AsyncSession, device_id: int) -> ItsDevice:
    device = await session.get(ItsDevice, device_id)
    if device is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "объект не найден")
    return device


async def _load_cycle(session: AsyncSession, cycle_id: int) -> SignalCycle:
    cycle = await session.get(SignalCycle, cycle_id)
    if cycle is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "цикл не найден")
    return cycle


@router.get("/crossings", response_model=list[CrossingBrief])
async def list_crossings(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Crossing).order_by(Crossing.id))
    return list(result.scalars())


@router.post("/crossings", response_model=CrossingOut, status_code=201)
async def create_crossing(payload: CrossingIn, session: AsyncSession = Depends(get_session)):
    crossing = Crossing(**payload.model_dump())
    session.add(crossing)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "slug уже занят") from exc
    await session.refresh(crossing)
    return crossing


@router.get("/crossings/{crossing_id}", response_model=CrossingOut)
async def get_crossing(crossing_id: int, session: AsyncSession = Depends(get_session)):
    return await _load(session, crossing_id)


@router.patch("/crossings/{crossing_id}", response_model=CrossingOut)
async def update_crossing(
    crossing_id: int,
    payload: CrossingUpdate,
    session: AsyncSession = Depends(get_session),
):
    crossing = await _load(session, crossing_id)
    data = payload.model_dump(exclude_unset=True)

    forward = data.get("lanes_forward", crossing.lanes_forward)
    backward = data.get("lanes_backward", crossing.lanes_backward)
    if forward + backward < 1:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "нужна хотя бы одна полоса — в любом направлении"
        )

    if "active_cycle_id" in data and data["active_cycle_id"] is not None:
        cycle = await session.get(SignalCycle, data["active_cycle_id"])
        if cycle is None or cycle.crossing_id != crossing_id:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "цикл не найден у этого перехода"
            )

    for key, value in data.items():
        setattr(crossing, key, value)
    await session.commit()
    await session.refresh(crossing)
    return crossing


@router.delete("/crossings/{crossing_id}", status_code=204)
async def delete_crossing(crossing_id: int, session: AsyncSession = Depends(get_session)):
    crossing = await _load(session, crossing_id)
    await session.delete(crossing)
    await session.commit()


@router.post("/crossings/{crossing_id}/its-devices", response_model=ItsDeviceOut, status_code=201)
async def add_its_device(
    crossing_id: int, payload: ItsDeviceIn, session: AsyncSession = Depends(get_session)
):
    await _load(session, crossing_id)
    device = ItsDevice(crossing_id=crossing_id, **payload.model_dump())
    session.add(device)
    await session.commit()
    await session.refresh(device)
    return device


@router.patch("/its-devices/{device_id}", response_model=ItsDeviceOut)
async def update_its_device(
    device_id: int, payload: ItsDeviceUpdate, session: AsyncSession = Depends(get_session)
):
    device = await _load_device(session, device_id)
    data = payload.model_dump(exclude_unset=True)

    if device.device_type is DeviceType.LOOP:
        rejected = (POLE_FIELDS | CAMERA_ONLY_FIELDS) & data.keys()
        if rejected:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"недоступно для индукционной петли: {sorted(rejected)}",
            )
    else:
        rejected = LOOP_FIELDS & data.keys()
        if rejected:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"применимо только к петле: {sorted(rejected)}"
            )
        if "stream_url" in data and device.device_type is not DeviceType.CAMERA:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "ссылка на трансляцию доступна только для камеры"
            )

    for key, value in data.items():
        setattr(device, key, value)
    await session.commit()
    await session.refresh(device)
    return device


@router.delete("/its-devices/{device_id}", status_code=204)
async def delete_its_device(device_id: int, session: AsyncSession = Depends(get_session)):
    device = await _load_device(session, device_id)
    await session.delete(device)
    await session.commit()


@router.post("/crossings/{crossing_id}/signal-cycles", response_model=SignalCycleOut, status_code=201)
async def add_signal_cycle(
    crossing_id: int, payload: SignalCycleIn, session: AsyncSession = Depends(get_session)
):
    await _load(session, crossing_id)
    cycle = SignalCycle(crossing_id=crossing_id, **payload.model_dump())
    session.add(cycle)
    await session.commit()
    await session.refresh(cycle)
    return cycle


@router.patch("/signal-cycles/{cycle_id}", response_model=SignalCycleOut)
async def update_signal_cycle(
    cycle_id: int, payload: SignalCycleUpdate, session: AsyncSession = Depends(get_session)
):
    cycle = await _load_cycle(session, cycle_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(cycle, key, value)
    await session.commit()
    await session.refresh(cycle)
    return cycle


@router.delete("/signal-cycles/{cycle_id}", status_code=204)
async def delete_signal_cycle(cycle_id: int, session: AsyncSession = Depends(get_session)):
    cycle = await _load_cycle(session, cycle_id)
    await session.delete(cycle)
    await session.commit()


async def _prune_old(session: AsyncSession, crossing: Crossing) -> None:
    """Удаляет журнал/снимки этого перехода старше log_retention_hours."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=crossing.log_retention_hours)
    await session.execute(
        delete(SignalLogEntry).where(
            SignalLogEntry.crossing_id == crossing.id, SignalLogEntry.at < cutoff
        )
    )
    await session.execute(
        delete(TrafficMetricSnapshot).where(
            TrafficMetricSnapshot.crossing_id == crossing.id, TrafficMetricSnapshot.at < cutoff
        )
    )
    await session.execute(
        delete(SceneSnapshot).where(
            SceneSnapshot.crossing_id == crossing.id, SceneSnapshot.at < cutoff
        )
    )


@router.get("/crossings/{crossing_id}/logs", response_model=list[SignalLogEntryOut])
async def list_logs(
    crossing_id: int,
    device_id: int | None = None,
    limit: int = 500,
    session: AsyncSession = Depends(get_session),
):
    await _load(session, crossing_id)
    stmt = select(SignalLogEntry).where(SignalLogEntry.crossing_id == crossing_id)
    # device_id не передан вовсе — вся история; device_id=0 — только записи
    # уровня перехода (device_id IS NULL); иначе — записи конкретного датчика
    if device_id == 0:
        stmt = stmt.where(SignalLogEntry.device_id.is_(None))
    elif device_id is not None:
        stmt = stmt.where(SignalLogEntry.device_id == device_id)
    stmt = stmt.order_by(SignalLogEntry.at.desc()).limit(min(limit, 2000))
    result = await session.execute(stmt)
    return list(result.scalars())[::-1]


@router.post("/crossings/{crossing_id}/logs", response_model=SignalLogEntryOut, status_code=201)
async def add_log_entry(
    crossing_id: int, payload: SignalLogEntryIn, session: AsyncSession = Depends(get_session)
):
    crossing = await _load(session, crossing_id)
    if payload.device_id is not None:
        device = await session.get(ItsDevice, payload.device_id)
        if device is None or device.crossing_id != crossing_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "объект не найден у этого перехода")
    entry = SignalLogEntry(crossing_id=crossing_id, **payload.model_dump())
    session.add(entry)
    await _prune_old(session, crossing)
    await session.commit()
    await session.refresh(entry)
    return entry


@router.get("/crossings/{crossing_id}/metrics", response_model=list[TrafficMetricSnapshotOut])
async def list_metrics(
    crossing_id: int,
    limit: int = 1000,
    session: AsyncSession = Depends(get_session),
):
    await _load(session, crossing_id)
    stmt = (
        select(TrafficMetricSnapshot)
        .where(TrafficMetricSnapshot.crossing_id == crossing_id)
        .order_by(TrafficMetricSnapshot.at.desc())
        .limit(min(limit, 5000))
    )
    result = await session.execute(stmt)
    return list(result.scalars())[::-1]


@router.post(
    "/crossings/{crossing_id}/metrics", response_model=TrafficMetricSnapshotOut, status_code=201
)
async def add_metric_snapshot(
    crossing_id: int, payload: TrafficMetricSnapshotIn, session: AsyncSession = Depends(get_session)
):
    crossing = await _load(session, crossing_id)
    snapshot = TrafficMetricSnapshot(crossing_id=crossing_id, **payload.model_dump())
    session.add(snapshot)
    await _prune_old(session, crossing)
    await session.commit()
    await session.refresh(snapshot)
    return snapshot


@router.get("/crossings/{crossing_id}/scene-snapshots", response_model=list[SceneSnapshotOut])
async def list_scene_snapshots(
    crossing_id: int,
    limit: int = 5000,
    session: AsyncSession = Depends(get_session),
):
    await _load(session, crossing_id)
    stmt = (
        select(SceneSnapshot)
        .where(SceneSnapshot.crossing_id == crossing_id)
        .order_by(SceneSnapshot.at.desc())
        .limit(min(limit, 20000))
    )
    result = await session.execute(stmt)
    return list(result.scalars())[::-1]


@router.post(
    "/crossings/{crossing_id}/scene-snapshots", response_model=SceneSnapshotOut, status_code=201
)
async def add_scene_snapshot(
    crossing_id: int, payload: SceneSnapshotIn, session: AsyncSession = Depends(get_session)
):
    crossing = await _load(session, crossing_id)
    snapshot = SceneSnapshot(crossing_id=crossing_id, **payload.model_dump())
    session.add(snapshot)
    await _prune_old(session, crossing)
    await session.commit()
    await session.refresh(snapshot)
    return snapshot
