from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Direction(str, enum.Enum):
    """Сторона света, с которой машины въезжают на перекрёсток."""

    N = "N"
    E = "E"
    S = "S"
    W = "W"


class Turn(str, enum.Enum):
    LEFT = "left"
    STRAIGHT = "straight"
    RIGHT = "right"


class RunStatus(str, enum.Enum):
    RUNNING = "running"
    STOPPED = "stopped"


direction_enum = Enum(Direction, name="direction", values_callable=lambda e: [m.value for m in e])
run_status_enum = Enum(RunStatus, name="run_status", values_callable=lambda e: [m.value for m in e])


class Intersection(Base):
    __tablename__ = "intersections"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    lane_width: Mapped[float] = mapped_column(Float, default=3.5)
    approach_length: Mapped[float] = mapped_column(Float, default=120.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    approaches: Mapped[list[Approach]] = relationship(
        back_populates="intersection", cascade="all, delete-orphan", lazy="selectin",
        order_by="Approach.id",
    )
    programs: Mapped[list[SignalProgram]] = relationship(
        back_populates="intersection", cascade="all, delete-orphan", lazy="selectin",
        order_by="SignalProgram.id",
    )


class Approach(Base):
    """Одно направление въезда: сколько полос, с какой интенсивностью приезжают машины."""

    __tablename__ = "approaches"
    __table_args__ = (
        UniqueConstraint("intersection_id", "direction", name="uq_approach_direction"),
        CheckConstraint("lanes_in between 1 and 4", name="ck_lanes_in"),
        CheckConstraint("lanes_out between 1 and 4", name="ck_lanes_out"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    intersection_id: Mapped[int] = mapped_column(
        ForeignKey("intersections.id", ondelete="CASCADE"), index=True
    )
    direction: Mapped[Direction] = mapped_column(direction_enum)
    lanes_in: Mapped[int] = mapped_column(Integer, default=2)
    lanes_out: Mapped[int] = mapped_column(Integer, default=2)
    speed_limit_kmh: Mapped[float] = mapped_column(Float, default=60.0)
    arrival_rate_vph: Mapped[float] = mapped_column(Float, default=600.0)
    # доли поворотов, например {"left": 0.2, "straight": 0.6, "right": 0.2}
    turn_ratios: Mapped[dict] = mapped_column(JSONB, default=dict)

    intersection: Mapped[Intersection] = relationship(back_populates="approaches")


class SignalProgram(Base):
    """Программа светофорного регулирования — упорядоченный набор фаз."""

    __tablename__ = "signal_programs"

    id: Mapped[int] = mapped_column(primary_key=True)
    intersection_id: Mapped[int] = mapped_column(
        ForeignKey("intersections.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(128))
    is_active: Mapped[bool] = mapped_column(default=False)

    intersection: Mapped[Intersection] = relationship(back_populates="programs")
    phases: Mapped[list[SignalPhase]] = relationship(
        back_populates="program", cascade="all, delete-orphan", lazy="selectin",
        order_by="SignalPhase.position",
    )


class SignalPhase(Base):
    __tablename__ = "signal_phases"
    __table_args__ = (
        UniqueConstraint("program_id", "position", name="uq_phase_position"),
        CheckConstraint("green_s > 0 and yellow_s >= 0 and all_red_s >= 0", name="ck_phase_timing"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    program_id: Mapped[int] = mapped_column(
        ForeignKey("signal_programs.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    green_s: Mapped[float] = mapped_column(Float, default=30.0)
    yellow_s: Mapped[float] = mapped_column(Float, default=3.0)
    all_red_s: Mapped[float] = mapped_column(Float, default=2.0)
    # разрешённые манёвры: {"N": ["straight", "right"], "S": ["straight", "right"]}
    movements: Mapped[dict] = mapped_column(JSONB, default=dict)

    program: Mapped[SignalProgram] = relationship(back_populates="phases")


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    intersection_id: Mapped[int] = mapped_column(
        ForeignKey("intersections.id", ondelete="CASCADE"), index=True
    )
    program_id: Mapped[int] = mapped_column(ForeignKey("signal_programs.id", ondelete="CASCADE"))
    status: Mapped[RunStatus] = mapped_column(run_status_enum, default=RunStatus.RUNNING)
    seed: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sim_duration_s: Mapped[float] = mapped_column(Float, default=0.0)

    metrics: Mapped[list[SimulationMetric]] = relationship(
        back_populates="run", cascade="all, delete-orphan", order_by="SimulationMetric.sim_time",
    )


class SimulationMetric(Base):
    """Снимок статистики по направлению, пишется раз в несколько секунд модельного времени."""

    __tablename__ = "simulation_metrics"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(
        ForeignKey("simulation_runs.id", ondelete="CASCADE"), index=True
    )
    sim_time: Mapped[float] = mapped_column(Float)
    direction: Mapped[Direction] = mapped_column(direction_enum)
    queue_length: Mapped[int] = mapped_column(Integer, default=0)
    avg_wait_s: Mapped[float] = mapped_column(Float, default=0.0)
    departed: Mapped[int] = mapped_column(Integer, default=0)

    run: Mapped[SimulationRun] = relationship(back_populates="metrics")
