"""Наполнение БД демонстрационным перекрёстком: python -m app.seed"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.db import SessionLocal, engine
from app.models import Approach, Direction, Intersection, SignalPhase, SignalProgram

SLUG = "central"

APPROACHES = [
    # направление, полос на въезд, полос на выезд, км/ч, машин в час
    (Direction.N, 2, 2, 60.0, 700.0),
    (Direction.S, 2, 2, 60.0, 700.0),
    (Direction.E, 2, 2, 50.0, 500.0),
    (Direction.W, 2, 2, 50.0, 500.0),
]

PHASES = [
    (0, 30.0, {"N": ["straight", "right"], "S": ["straight", "right"]}),
    (1, 12.0, {"N": ["left"], "S": ["left"]}),
    (2, 25.0, {"E": ["straight", "right"], "W": ["straight", "right"]}),
    (3, 10.0, {"E": ["left"], "W": ["left"]}),
]


async def seed() -> None:
    async with SessionLocal() as session:
        existing = await session.scalar(select(Intersection).where(Intersection.slug == SLUG))
        if existing is not None:
            print(f"перекрёсток '{SLUG}' уже есть (id={existing.id}), ничего не меняю")
            return

        intersection = Intersection(
            slug=SLUG,
            name="Центральный перекрёсток",
            lane_width=3.5,
            approach_length=120.0,
            approaches=[
                Approach(
                    direction=direction,
                    lanes_in=lanes_in,
                    lanes_out=lanes_out,
                    speed_limit_kmh=speed,
                    arrival_rate_vph=rate,
                    turn_ratios={"left": 0.2, "straight": 0.6, "right": 0.2},
                )
                for direction, lanes_in, lanes_out, speed, rate in APPROACHES
            ],
            programs=[
                SignalProgram(
                    name="Базовый цикл",
                    is_active=True,
                    phases=[
                        SignalPhase(
                            position=position,
                            green_s=green,
                            yellow_s=3.0,
                            all_red_s=2.0,
                            movements=movements,
                        )
                        for position, green, movements in PHASES
                    ],
                )
            ],
        )
        session.add(intersection)
        await session.commit()
        await session.refresh(intersection)
        print(f"создан перекрёсток '{SLUG}' (id={intersection.id})")


async def main() -> None:
    try:
        await seed()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
