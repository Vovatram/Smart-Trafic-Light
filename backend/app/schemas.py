from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import DeviceType, PedestrianSignal, SignalMode, VehicleSignal

POLE_DEFAULTS: dict[DeviceType, tuple[float, float]] = {
    # device_type -> (fov_deg, view_radius)
    DeviceType.CAMERA: (60.0, 35.0),
    DeviceType.MICROWAVE: (25.0, 18.0),
}


class CrossingIn(BaseModel):
    slug: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9\-]+$")
    name: str = Field(min_length=1, max_length=128)
    lane_width: float = Field(default=3.5, gt=1.0, le=6.0)
    lanes_forward: int = Field(default=2, ge=0, le=5)
    lanes_backward: int = Field(default=2, ge=0, le=5)
    road_length: float = Field(default=40.0, ge=10.0, le=200.0)
    crossing_width: float = Field(default=3.0, ge=1.5, le=8.0)
    vph_forward: float = Field(default=300.0, ge=0, le=2000)
    vph_backward: float = Field(default=300.0, ge=0, le=2000)
    peds_left_vph: float = Field(default=120.0, ge=0, le=2000)
    peds_right_vph: float = Field(default=120.0, ge=0, le=2000)

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
    vph_forward: float | None = Field(default=None, ge=0, le=2000)
    vph_backward: float | None = Field(default=None, ge=0, le=2000)
    peds_left_vph: float | None = Field(default=None, ge=0, le=2000)
    peds_right_vph: float | None = Field(default=None, ge=0, le=2000)
    signal_mode: SignalMode | None = None
    active_cycle_id: int | None = None
    all_red_after_cars_s: float | None = Field(default=None, ge=1, le=15)
    all_red_after_peds_s: float | None = Field(default=None, ge=1, le=15)
    button_min_green_s: float | None = Field(default=None, ge=3, le=180)
    button_peds_s: float | None = Field(default=None, ge=3, le=120)


class ItsDeviceIn(BaseModel):
    device_type: DeviceType
    x: float = Field(ge=-500, le=500)
    z: float = Field(ge=-500, le=500)
    height: float | None = Field(default=None, ge=1.5, le=12)
    rotation_deg: float | None = Field(default=None, ge=0, lt=360)
    fov_deg: float | None = Field(default=None, ge=5, le=180)
    view_radius: float | None = Field(default=None, ge=2, le=150)
    stream_url: str | None = Field(default=None, max_length=512)
    loop_length: float | None = Field(default=None, ge=0.5, le=5)

    @model_validator(mode="after")
    def apply_type_rules(self) -> "ItsDeviceIn":
        if self.device_type is DeviceType.LOOP:
            if any(
                v is not None
                for v in (self.height, self.rotation_deg, self.fov_deg, self.view_radius, self.stream_url)
            ):
                raise ValueError("для индукционной петли доступны только позиция и длина")
            self.loop_length = self.loop_length if self.loop_length is not None else 2.0
        else:
            if self.loop_length is not None:
                raise ValueError("длина петли применима только к индукционной петле")
            if self.stream_url is not None and self.device_type is not DeviceType.CAMERA:
                raise ValueError("ссылка на трансляцию доступна только для камеры")
            default_fov, default_radius = POLE_DEFAULTS[self.device_type]
            self.height = self.height if self.height is not None else 5.0
            self.rotation_deg = self.rotation_deg if self.rotation_deg is not None else 0.0
            self.fov_deg = self.fov_deg if self.fov_deg is not None else default_fov
            self.view_radius = self.view_radius if self.view_radius is not None else default_radius
        return self


class ItsDeviceUpdate(BaseModel):
    x: float | None = Field(default=None, ge=-500, le=500)
    z: float | None = Field(default=None, ge=-500, le=500)
    height: float | None = Field(default=None, ge=1.5, le=12)
    rotation_deg: float | None = Field(default=None, ge=0, lt=360)
    fov_deg: float | None = Field(default=None, ge=5, le=180)
    view_radius: float | None = Field(default=None, ge=2, le=150)
    stream_url: str | None = Field(default=None, max_length=512)
    loop_length: float | None = Field(default=None, ge=0.5, le=5)


class ItsDeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_type: DeviceType
    x: float
    z: float
    height: float | None
    rotation_deg: float | None
    fov_deg: float | None
    view_radius: float | None
    stream_url: str | None
    loop_length: float | None


class SignalCycleIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    green_cars_s: float = Field(default=40.0, ge=3, le=180)
    green_peds_s: float = Field(default=15.0, ge=3, le=120)


class SignalCycleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    green_cars_s: float | None = Field(default=None, ge=3, le=180)
    green_peds_s: float | None = Field(default=None, ge=3, le=120)


class SignalCycleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    green_cars_s: float
    green_peds_s: float


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
    vph_forward: float
    vph_backward: float
    peds_left_vph: float
    peds_right_vph: float
    signal_mode: SignalMode
    active_cycle_id: int | None
    all_red_after_cars_s: float
    all_red_after_peds_s: float
    button_min_green_s: float
    button_peds_s: float
    created_at: datetime
    its_devices: list[ItsDeviceOut]
    cycles: list[SignalCycleOut]


class CrossingBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
