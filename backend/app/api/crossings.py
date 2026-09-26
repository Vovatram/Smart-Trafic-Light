from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Crossing, DeviceType, ItsDevice, SignalCycle
from app.schemas import (
    CrossingBrief,
    CrossingIn,
    CrossingOut,
    CrossingUpdate,
    ItsDeviceIn,
    ItsDeviceOut,
    ItsDeviceUpdate,
    SignalCycleIn,
    SignalCycleOut,
    SignalCycleUpdate,
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
