from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import CameraSide, PedestrianSignal, VehicleSignal


class CrossingIn(BaseModel):
    slug: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9\-]+$")
    name: str = Field(min_length=1, max_length=128)
    lane_width: float = Field(default=3.5, gt=1.0, le=6.0)
    lanes_forward: int = Field(default=2, ge=0, le=5)
    lanes_backward: int = Field(default=2, ge=0, le=5)
    road_length: float = Field(default=40.0, ge=10.0, le=200.0)
    crossing_width: float = Field(default=3.0, ge=1.5, le=8.0)

    @model_validator(mode="after")
    def check_lanes(self) -> "CrossingIn":
        if self.lanes_forward + self.lanes_backward < 1:
            raise ValueError("нужна хотя бы одна полоса — в любом направлении")
        return self


class CrossingUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    lane_width: float | None = Field(default=None, gt=1.0, le=6.0)
    lanes_forward: int | None = Field(default=None, ge=0, le=5)
    lanes_backward: int | None = Field(default=None, ge=0, le=5)
    road_length: float | None = Field(default=None, ge=10.0, le=200.0)
    crossing_width: float | None = Field(default=None, ge=1.5, le=8.0)
    vehicle_signal: VehicleSignal | None = None
    pedestrian_signal: PedestrianSignal | None = None


class CameraPoleIn(BaseModel):
    side: CameraSide = CameraSide.LEFT
    height: float = Field(default=5.0, ge=1.5, le=12.0)
    rotation_deg: float = Field(default=0.0, ge=0, lt=360)


class CameraPoleUpdate(BaseModel):
    side: CameraSide | None = None
    height: float | None = Field(default=None, ge=1.5, le=12.0)
    rotation_deg: float | None = Field(default=None, ge=0, lt=360)


class CameraPoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    side: CameraSide
    height: float
    rotation_deg: float


class CrossingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    lane_width: float
    lanes_forward: int
    lanes_backward: int
    road_length: float
    crossing_width: float
    vehicle_signal: VehicleSignal
    pedestrian_signal: PedestrianSignal
    created_at: datetime
    camera_poles: list[CameraPoleOut]


class CrossingBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
