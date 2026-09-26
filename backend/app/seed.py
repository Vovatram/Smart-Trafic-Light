"""Наполнение БД демонстрационным переходом: python -m app.seed"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.db import SessionLocal, engine
from app.models import Crossing, SignalCycle

SLUG = "central"


async def seed() -> None:
    async with SessionLocal() as session:
        existing = await session.scalar(select(Crossing).where(Crossing.slug == SLUG))
        if existing is not None:
            print(f"переход '{SLUG}' уже есть (id={existing.id}), ничего не меняю")
            return

        crossing = Crossing(
            slug=SLUG,
            name="Переход на Центральной улице",
            lane_width=3.5,
            lanes_forward=2,
            lanes_backward=3,
            road_length=40.0,
            crossing_width=3.0,
            cycles=[
                SignalCycle(name="Час пик", green_cars_s=60.0, green_peds_s=20.0),
                SignalCycle(name="Меж пик", green_cars_s=40.0, green_peds_s=15.0),
            ],
        )
        session.add(crossing)
        await session.commit()
        await session.refresh(crossing)
        print(f"создан переход '{SLUG}' (id={crossing.id})")


async def main() -> None:
    try:
        await seed()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
