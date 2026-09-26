from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class VehicleSignal(str, enum.Enum):
    RED = "red"
    YELLOW = "yellow"
    GREEN = "green"


class PedestrianSignal(str, enum.Enum):
    WALK = "walk"
    STOP = "stop"


class CameraSide(str, enum.Enum):
    """Какой обочины дороги держится столб с камерой (вид сверху, по X)."""

    LEFT = "left"
    RIGHT = "right"


vehicle_signal_enum = Enum(
    VehicleSignal, name="vehicle_signal", values_callable=lambda e: [m.value for m in e]
)
pedestrian_signal_enum = Enum(
    PedestrianSignal, name="pedestrian_signal", values_callable=lambda e: [m.value for m in e]
)
camera_side_enum = Enum(
    CameraSide, name="camera_side", values_callable=lambda e: [m.value for m in e]
)


class Crossing(Base):
    """Прямой участок дороги с пешеходным переходом посередине.

    Правостороннее движение: у каждого направления полосы лежат со своей
    правой стороны по ходу движения (см. комментарий в frontend/scene/layout.ts
    с выводом через правило правой руки) — сама раскладка по X считается на
    фронтенде из lanes_forward/lanes_backward, бэкенд хранит только счётчики.
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

    camera_poles: Mapped[list[CameraPole]] = relationship(
        back_populates="crossing", cascade="all, delete-orphan", lazy="selectin",
        order_by="CameraPole.id",
    )


class CameraPole(Base):
    """Отдельно стоящий столб с камерой наблюдения — не светофор.

    Позиция вдоль дороги (Z) не хранится: столб всегда стоит снаружи
    проезжей части напротив перехода (Z = 0) на выбранной обочине (side),
    фактический X пересчитывается на фронтенде из текущего числа полос.
    """

    __tablename__ = "camera_poles"
    __table_args__ = (
        CheckConstraint("height between 1.5 and 12", name="ck_camera_height"),
        CheckConstraint("rotation_deg >= 0 and rotation_deg < 360", name="ck_camera_rotation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    crossing_id: Mapped[int] = mapped_column(
        ForeignKey("crossings.id", ondelete="CASCADE"), index=True
    )
    side: Mapped[CameraSide] = mapped_column(camera_side_enum, default=CameraSide.LEFT)
    height: Mapped[float] = mapped_column(Float, default=5.0)
    rotation_deg: Mapped[float] = mapped_column(Float, default=0.0)

    crossing: Mapped[Crossing] = relationship(back_populates="camera_poles")
