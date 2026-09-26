from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class VehicleSignal(str, enum.Enum):
    RED = "red"
    YELLOW = "yellow"
    GREEN = "green"


class PedestrianSignal(str, enum.Enum):
    WALK = "walk"
    STOP = "stop"


vehicle_signal_enum = Enum(
    VehicleSignal, name="vehicle_signal", values_callable=lambda e: [m.value for m in e]
)
pedestrian_signal_enum = Enum(
    PedestrianSignal, name="pedestrian_signal", values_callable=lambda e: [m.value for m in e]
)


class Crossing(Base):
    """Прямой участок дороги с пешеходным переходом посередине.

    Правостороннее движение: полосы направления N (в сторону +Z) лежат
    справа от осевой (X > 0), полосы направления K (в сторону -Z) — слева
    (X < 0). Каждое направление едет по своей стороне, у своей обочины.
    """

    __tablename__ = "crossings"
    __table_args__ = (
        CheckConstraint("lanes_forward between 0 and 5", name="ck_lanes_forward"),
        CheckConstraint("lanes_backward between 0 and 5", name="ck_lanes_backward"),
        CheckConstraint("lanes_forward + lanes_backward >= 1", name="ck_lanes_total"),
        CheckConstraint("lane_width > 0", name="ck_lane_width"),
        CheckConstraint("road_length > 0", name="ck_road_length"),
        CheckConstraint("crossing_width > 0", name="ck_crossing_width"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))

    lane_width: Mapped[float] = mapped_column(Float, default=3.5)
    lanes_forward: Mapped[int] = mapped_column(Integer, default=2)
    lanes_backward: Mapped[int] = mapped_column(Integer, default=2)
    road_length: Mapped[float] = mapped_column(Float, default=40.0)
    crossing_width: Mapped[float] = mapped_column(Float, default=3.0)

    vehicle_signal: Mapped[VehicleSignal] = mapped_column(
        vehicle_signal_enum, default=VehicleSignal.GREEN
    )
    pedestrian_signal: Mapped[PedestrianSignal] = mapped_column(
        pedestrian_signal_enum, default=PedestrianSignal.STOP
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
