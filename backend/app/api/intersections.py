from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.mapping import to_intersection_config, to_phase_configs
from app.models import Approach, Intersection, SignalPhase, SignalProgram
from app.schemas import (
    IntersectionBrief,
    IntersectionIn,
    IntersectionOut,
    IntersectionUpdate,
    ProgramIn,
    ProgramOut,
)
from app.sim.engine import Simulation

router = APIRouter(prefix="/api", tags=["intersections"])


async def _load(session: AsyncSession, intersection_id: int) -> Intersection:
    intersection = await session.get(Intersection, intersection_id)
    if intersection is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "перекрёсток не найден")
    return intersection


async def _load_program(session: AsyncSession, program_id: int) -> SignalProgram:
    program = await session.get(SignalProgram, program_id)
    if program is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "программа не найдена")
    return program


@router.get("/intersections", response_model=list[IntersectionBrief])
async def list_intersections(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Intersection).order_by(Intersection.id))
    return list(result.scalars())


@router.post("/intersections", response_model=IntersectionOut, status_code=201)
async def create_intersection(
    payload: IntersectionIn, session: AsyncSession = Depends(get_session)
):
    directions = [a.direction for a in payload.approaches]
    if len(set(directions)) != len(directions):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "въезды направлений дублируются")

    intersection = Intersection(
        slug=payload.slug,
        name=payload.name,
        lane_width=payload.lane_width,
        approach_length=payload.approach_length,
        approaches=[Approach(**a.model_dump()) for a in payload.approaches],
    )
    session.add(intersection)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "slug уже занят") from exc
    await session.refresh(intersection)
    return intersection


@router.get("/intersections/{intersection_id}", response_model=IntersectionOut)
async def get_intersection(intersection_id: int, session: AsyncSession = Depends(get_session)):
    return await _load(session, intersection_id)


@router.patch("/intersections/{intersection_id}", response_model=IntersectionOut)
async def update_intersection(
    intersection_id: int,
    payload: IntersectionUpdate,
    session: AsyncSession = Depends(get_session),
):
    intersection = await _load(session, intersection_id)
    data = payload.model_dump(exclude_unset=True)
    approaches = data.pop("approaches", None)
    for key, value in data.items():
        setattr(intersection, key, value)
    if approaches is not None:
        directions = [a["direction"] for a in approaches]
        if len(set(directions)) != len(directions):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "въезды направлений дублируются"
            )
        intersection.approaches = [Approach(**a) for a in approaches]
    await session.commit()
    await session.refresh(intersection)
    return intersection


@router.delete("/intersections/{intersection_id}", status_code=204)
async def delete_intersection(intersection_id: int, session: AsyncSession = Depends(get_session)):
    intersection = await _load(session, intersection_id)
    await session.delete(intersection)
    await session.commit()


@router.get("/intersections/{intersection_id}/layout")
async def get_layout(intersection_id: int, session: AsyncSession = Depends(get_session)):
    """Геометрия без запуска симуляции — фронтенд рисует по ней сцену."""
    intersection = await _load(session, intersection_id)
    program = next((p for p in intersection.programs if p.is_active), None)
    phases = to_phase_configs(program) if program else []
    simulation = Simulation(to_intersection_config(intersection), phases or _idle_phases())
    return simulation.layout()


def _idle_phases():
    from app.sim.engine import PhaseConfig

    return [PhaseConfig(green_s=1.0, yellow_s=0.0, all_red_s=0.0, movements={})]


@router.post("/intersections/{intersection_id}/programs", response_model=ProgramOut, status_code=201)
async def create_program(
    intersection_id: int, payload: ProgramIn, session: AsyncSession = Depends(get_session)
):
    await _load(session, intersection_id)
    positions = [p.position for p in payload.phases]
    if len(set(positions)) != len(positions):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "позиции фаз дублируются")

    program = SignalProgram(
        intersection_id=intersection_id,
        name=payload.name,
        is_active=payload.is_active,
        phases=[SignalPhase(**p.model_dump()) for p in payload.phases],
    )
    session.add(program)
    if payload.is_active:
        await _deactivate_others(session, intersection_id, exclude=None)
    await session.commit()
    await session.refresh(program)
    return program


@router.put("/programs/{program_id}", response_model=ProgramOut)
async def replace_program(
    program_id: int, payload: ProgramIn, session: AsyncSession = Depends(get_session)
):
    program = await _load_program(session, program_id)
    positions = [p.position for p in payload.phases]
    if len(set(positions)) != len(positions):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "позиции фаз дублируются")

    program.name = payload.name
    program.is_active = payload.is_active
    program.phases = [SignalPhase(**p.model_dump()) for p in payload.phases]
    if payload.is_active:
        await _deactivate_others(session, program.intersection_id, exclude=program.id)
    await session.commit()
    await session.refresh(program)
    return program


@router.post("/programs/{program_id}/activate", response_model=ProgramOut)
async def activate_program(program_id: int, session: AsyncSession = Depends(get_session)):
    program = await _load_program(session, program_id)
    await _deactivate_others(session, program.intersection_id, exclude=program.id)
    program.is_active = True
    await session.commit()
    await session.refresh(program)
    return program


@router.delete("/programs/{program_id}", status_code=204)
async def delete_program(program_id: int, session: AsyncSession = Depends(get_session)):
    program = await _load_program(session, program_id)
    await session.delete(program)
    await session.commit()


async def _deactivate_others(
    session: AsyncSession, intersection_id: int, exclude: int | None
) -> None:
    stmt = (
        update(SignalProgram)
        .where(SignalProgram.intersection_id == intersection_id)
        .values(is_active=False)
    )
    if exclude is not None:
        stmt = stmt.where(SignalProgram.id != exclude)
    await session.execute(stmt)
