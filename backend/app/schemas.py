from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import Direction, RunStatus


class ApproachIn(BaseModel):
    direction: Direction
    lanes_in: int = Field(default=2, ge=1, le=4)
    lanes_out: int = Field(default=2, ge=1, le=4)
    speed_limit_kmh: float = Field(default=60.0, gt=0, le=130)
    arrival_rate_vph: float = Field(default=600.0, ge=0, le=4000)
    turn_ratios: dict[str, float] = Field(
        default_factory=lambda: {"left": 0.2, "straight": 0.6, "right": 0.2}
    )

    @field_validator("turn_ratios")
    @classmethod
    def check_ratios(cls, value: dict[str, float]) -> dict[str, float]:
        unknown = set(value) - {"left", "straight", "right"}
        if unknown:
            raise ValueError(f"неизвестные манёвры: {sorted(unknown)}")
        if any(v < 0 for v in value.values()):
            raise ValueError("доли поворотов не могут быть отрицательными")
        if sum(value.values()) <= 0:
            raise ValueError("хотя бы один манёвр должен иметь положительную долю")
        return value


class ApproachOut(ApproachIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class PhaseIn(BaseModel):
    position: int = Field(ge=0)
    green_s: float = Field(default=30.0, gt=0, le=300)
    yellow_s: float = Field(default=3.0, ge=0, le=10)
    all_red_s: float = Field(default=2.0, ge=0, le=10)
    movements: dict[str, list[str]] = Field(default_factory=dict)

    @field_validator("movements")
    @classmethod
    def check_movements(cls, value: dict[str, list[str]]) -> dict[str, list[str]]:
        for key, turns in value.items():
            if key not in Direction.__members__:
                raise ValueError(f"неизвестное направление: {key}")
            unknown = set(turns) - {"left", "straight", "right"}
            if unknown:
                raise ValueError(f"неизвестные манёвры: {sorted(unknown)}")
        return value


class PhaseOut(PhaseIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class ProgramIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    is_active: bool = False
    phases: list[PhaseIn] = Field(min_length=1)


class ProgramOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_active: bool
    phases: list[PhaseOut]


class IntersectionIn(BaseModel):
    slug: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9\-]+$")
    name: str = Field(min_length=1, max_length=128)
    lane_width: float = Field(default=3.5, gt=1.0, le=6.0)
    approach_length: float = Field(default=120.0, ge=40.0, le=400.0)
    approaches: list[ApproachIn] = Field(min_length=1, max_length=4)


class IntersectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    lane_width: float | None = Field(default=None, gt=1.0, le=6.0)
    approach_length: float | None = Field(default=None, ge=40.0, le=400.0)
    approaches: list[ApproachIn] | None = Field(default=None, min_length=1, max_length=4)


class IntersectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    lane_width: float
    approach_length: float
    created_at: datetime
    approaches: list[ApproachOut]
    programs: list[ProgramOut]


class IntersectionBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str


class RunStart(BaseModel):
    program_id: int | None = None
    seed: int = 0


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    intersection_id: int
    program_id: int
    status: RunStatus
    seed: int
    started_at: datetime
    stopped_at: datetime | None
    sim_duration_s: float


class RunControl(BaseModel):
    speed: int | None = Field(default=None, ge=1, le=8)
    paused: bool | None = None


class MetricOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sim_time: float
    direction: Direction
    queue_length: int
    avg_wait_s: float
    departed: int
