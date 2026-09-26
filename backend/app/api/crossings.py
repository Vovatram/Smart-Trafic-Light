from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import CameraPole, Crossing
from app.schemas import (
    CameraPoleIn,
    CameraPoleOut,
    CameraPoleUpdate,
    CrossingBrief,
    CrossingIn,
    CrossingOut,
    CrossingUpdate,
)

router = APIRouter(prefix="/api", tags=["crossings"])


async def _load(session: AsyncSession, crossing_id: int) -> Crossing:
    crossing = await session.get(Crossing, crossing_id)
    if crossing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "переход не найден")
    return crossing


async def _load_camera(session: AsyncSession, camera_id: int) -> CameraPole:
    camera = await session.get(CameraPole, camera_id)
    if camera is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "камера не найдена")
    return camera


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


@router.post(
    "/crossings/{crossing_id}/camera-poles", response_model=CameraPoleOut, status_code=201
)
async def add_camera_pole(
    crossing_id: int, payload: CameraPoleIn, session: AsyncSession = Depends(get_session)
):
    await _load(session, crossing_id)
    camera = CameraPole(crossing_id=crossing_id, **payload.model_dump())
    session.add(camera)
    await session.commit()
    await session.refresh(camera)
    return camera


@router.patch("/camera-poles/{camera_id}", response_model=CameraPoleOut)
async def update_camera_pole(
    camera_id: int, payload: CameraPoleUpdate, session: AsyncSession = Depends(get_session)
):
    camera = await _load_camera(session, camera_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(camera, key, value)
    await session.commit()
    await session.refresh(camera)
    return camera


@router.delete("/camera-poles/{camera_id}", status_code=204)
async def delete_camera_pole(camera_id: int, session: AsyncSession = Depends(get_session)):
    camera = await _load_camera(session, camera_id)
    await session.delete(camera)
    await session.commit()
