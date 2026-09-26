"""Перевод строк БД в конфигурацию расчётного ядра."""

from __future__ import annotations

from app.geometry import ApproachConfig, IntersectionConfig
from app.models import Intersection, SignalProgram
from app.sim.engine import PhaseConfig


def to_intersection_config(intersection: Intersection) -> IntersectionConfig:
    return IntersectionConfig(
        lane_width=intersection.lane_width,
        approach_length=intersection.approach_length,
        approaches={
            a.direction: ApproachConfig(
                direction=a.direction,
                lanes_in=a.lanes_in,
                lanes_out=a.lanes_out,
                speed_limit_kmh=a.speed_limit_kmh,
                arrival_rate_vph=a.arrival_rate_vph,
                turn_ratios=dict(a.turn_ratios or {}),
            )
            for a in intersection.approaches
        },
    )


def to_phase_configs(program: SignalProgram) -> list[PhaseConfig]:
    return [
        PhaseConfig(
            green_s=p.green_s,
            yellow_s=p.yellow_s,
            all_red_s=p.all_red_s,
            movements={k: list(v) for k, v in (p.movements or {}).items()},
        )
        for p in sorted(program.phases, key=lambda p: p.position)
    ]
