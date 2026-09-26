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


class DeviceType(str, enum.Enum):
    """Тип ИТС-объекта на сцене."""

    CAMERA = "camera"
    MICROWAVE = "microwave"
    LOOP = "loop"


class SignalMode(str, enum.Enum):
    """Режим управления светофором перехода."""

    MANUAL = "manual"  # ручной выбор сигнала кликом по светофору
    ADAPTIVE = "adaptive"  # заглушка: всегда зелёный пешеходам, красный машинам
    CYCLE = "cycle"  # повторяющийся цикл из активного SignalCycle
    BUTTON = "button"  # зелёный машинам, пока не нажата кнопка вызова


vehicle_signal_enum = Enum(
    VehicleSignal, name="vehicle_signal", values_callable=lambda e: [m.value for m in e]
)
pedestrian_signal_enum = Enum(
    PedestrianSignal, name="pedestrian_signal", values_callable=lambda e: [m.value for m in e]
)
device_type_enum = Enum(
    DeviceType, name="its_device_type", values_callable=lambda e: [m.value for m in e]
)
signal_mode_enum = Enum(
    SignalMode, name="signal_mode", values_callable=lambda e: [m.value for m in e]
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
        CheckConstraint("vph_forward between 0 and 2000", name="ck_vph_forward"),
        CheckConstraint("vph_backward between 0 and 2000", name="ck_vph_backward"),
        CheckConstraint("peds_left_vph between 0 and 2000", name="ck_peds_left"),
        CheckConstraint("peds_right_vph between 0 and 2000", name="ck_peds_right"),
        CheckConstraint("all_red_s between 1 and 15", name="ck_all_red_s"),
        CheckConstraint("button_min_green_s between 3 and 180", name="ck_button_min_green"),
        CheckConstraint("button_peds_s between 3 and 120", name="ck_button_peds"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))

    lane_width: Mapped[float] = mapped_column(Float, default=3.5)
    lanes_forward: Mapped[int] = mapped_column(Integer, default=2)
    lanes_backward: Mapped[int] = mapped_column(Integer, default=2)
    road_length: Mapped[float] = mapped_column(Float, default=40.0)
    crossing_width: Mapped[float] = mapped_column(Float, default=3.0)

    # процедурная генерация потока: машин/пешеходов в час, отдельно на
    # каждое из 4 "начал" — оба конца дороги и обе обочины перехода
    vph_forward: Mapped[float] = mapped_column(Float, default=300.0)
    vph_backward: Mapped[float] = mapped_column(Float, default=300.0)
    peds_left_vph: Mapped[float] = mapped_column(Float, default=120.0)
    peds_right_vph: Mapped[float] = mapped_column(Float, default=120.0)

    vehicle_signal: Mapped[VehicleSignal] = mapped_column(
        vehicle_signal_enum, default=VehicleSignal.GREEN
    )
    pedestrian_signal: Mapped[PedestrianSignal] = mapped_column(
        pedestrian_signal_enum, default=PedestrianSignal.STOP
    )

    # режим управления: см. SignalMode. В manual действуют vehicle_signal/
    # pedestrian_signal напрямую (кликом по светофору); в остальных режимах
    # их считает клиент по формулам ниже, эти поля — только "последнее
    # известное" значение для отображения/совместимости.
    signal_mode: Mapped[SignalMode] = mapped_column(signal_mode_enum, default=SignalMode.MANUAL)
    active_cycle_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "signal_cycles.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_crossings_active_cycle",
        ),
        nullable=True,
    )
    all_red_s: Mapped[float] = mapped_column(Float, default=3.0)  # "красный всем" между фазами
    button_min_green_s: Mapped[float] = mapped_column(Float, default=15.0)
    button_peds_s: Mapped[float] = mapped_column(Float, default=15.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    its_devices: Mapped[list[ItsDevice]] = relationship(
        back_populates="crossing", cascade="all, delete-orphan", lazy="selectin",
        order_by="ItsDevice.id",
    )
    cycles: Mapped[list[SignalCycle]] = relationship(
        back_populates="crossing",
        foreign_keys="SignalCycle.crossing_id",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="SignalCycle.id",
    )


class ItsDevice(Base):
    """ИТС-объект на сцене: камера, микроволновый датчик или индукционная петля.

    Позиция (x, z) — мировые координаты, куда пользователь кликнул в режиме
    установки (вид сверху); столб/петля рисуются ровно там, без привязки к
    текущей геометрии полос. Камера и датчик стоят на столбе и имеют угол
    обзора/поворота и дальность; петля лежит на полотне дороги и хранит
    только размер. Ссылка на трансляцию — только у камеры.
    """

    __tablename__ = "its_devices"
    __table_args__ = (
        CheckConstraint("height is null or height between 1.5 and 12", name="ck_device_height"),
        CheckConstraint(
            "rotation_deg is null or (rotation_deg >= 0 and rotation_deg < 360)",
            name="ck_device_rotation",
        ),
        CheckConstraint("fov_deg is null or fov_deg between 5 and 180", name="ck_device_fov"),
        CheckConstraint(
            "view_radius is null or view_radius between 2 and 150", name="ck_device_radius"
        ),
        CheckConstraint(
            "loop_length is null or loop_length between 0.5 and 5", name="ck_device_loop_length"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    crossing_id: Mapped[int] = mapped_column(
        ForeignKey("crossings.id", ondelete="CASCADE"), index=True
    )
    device_type: Mapped[DeviceType] = mapped_column(device_type_enum)
    x: Mapped[float] = mapped_column(Float)
    z: Mapped[float] = mapped_column(Float)

    # столб (камера / микроволновый датчик)
    height: Mapped[float | None] = mapped_column(Float, nullable=True)
    rotation_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    fov_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    view_radius: Mapped[float | None] = mapped_column(Float, nullable=True)
    stream_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # индукционная петля
    loop_length: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    crossing: Mapped[Crossing] = relationship(back_populates="its_devices")


class SignalCycle(Base):
    """Один сохранённый цикл: сколько зелёного машинам и сколько пешеходам.

    "Красный всем" между фазами общий для всех циклов перехода — берётся
    из Crossing.all_red_s, здесь не хранится.
    """

    __tablename__ = "signal_cycles"
    __table_args__ = (
        CheckConstraint("green_cars_s between 3 and 180", name="ck_cycle_green_cars"),
        CheckConstraint("green_peds_s between 3 and 120", name="ck_cycle_green_peds"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    crossing_id: Mapped[int] = mapped_column(
        ForeignKey("crossings.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(64))
    green_cars_s: Mapped[float] = mapped_column(Float, default=40.0)
    green_peds_s: Mapped[float] = mapped_column(Float, default=15.0)

    crossing: Mapped[Crossing] = relationship(
        back_populates="cycles", foreign_keys=[crossing_id]
    )
