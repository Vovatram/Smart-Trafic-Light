"""Микроскопическая модель перекрёстка: IDM-следование за лидером + фазы светофора."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

from app.geometry import HEADING, IntersectionConfig, IntersectionGeometry, Path
from app.models import Direction, Turn

# Параметры модели Intelligent Driver Model.
A_MAX = 2.0          # комфортное ускорение, м/с^2
B_COMFORT = 3.0      # комфортное замедление, м/с^2
B_MAX = 6.0          # экстренное замедление, м/с^2
GAP_MIN = 2.0        # минимальный зазор в пробке, м
HEADWAY = 1.2        # желаемый интервал до лидера, с
VEHICLE_LENGTH = 4.4
VEHICLE_WIDTH = 1.8
STOPPED_SPEED = 0.8  # ниже этого считаем, что машина стоит в очереди

GREEN = "green"
YELLOW = "yellow"
RED = "red"


@dataclass(slots=True)
class PhaseConfig:
    green_s: float = 30.0
    yellow_s: float = 3.0
    all_red_s: float = 2.0
    movements: dict[str, list[str]] = field(default_factory=dict)

    @property
    def total(self) -> float:
        return self.green_s + self.yellow_s + self.all_red_s

    def allows(self, direction: Direction, turn: Turn) -> bool:
        return turn.value in self.movements.get(direction.value, ())


class SignalController:
    """Циклический перебор фаз: зелёный -> жёлтый -> красный для всех."""

    def __init__(self, phases: list[PhaseConfig]) -> None:
        if not phases:
            raise ValueError("программа должна содержать хотя бы одну фазу")
        self.phases = phases
        self.index = 0
        self.elapsed = 0.0

    @property
    def phase(self) -> PhaseConfig:
        return self.phases[self.index]

    @property
    def sub_state(self) -> str:
        phase = self.phase
        if self.elapsed < phase.green_s:
            return GREEN
        if self.elapsed < phase.green_s + phase.yellow_s:
            return YELLOW
        return "all_red"

    @property
    def remaining(self) -> float:
        phase = self.phase
        if self.elapsed < phase.green_s:
            return phase.green_s - self.elapsed
        if self.elapsed < phase.green_s + phase.yellow_s:
            return phase.green_s + phase.yellow_s - self.elapsed
        return phase.total - self.elapsed

    def step(self, dt: float) -> None:
        self.elapsed += dt
        while self.elapsed >= self.phase.total:
            self.elapsed -= self.phase.total
            self.index = (self.index + 1) % len(self.phases)

    def state(self, direction: Direction, turn: Turn) -> str:
        if not self.phase.allows(direction, turn):
            return RED
        sub = self.sub_state
        if sub == GREEN:
            return GREEN
        if sub == YELLOW:
            return YELLOW
        return RED


@dataclass(slots=True)
class Vehicle:
    id: int
    direction: Direction
    turn: Turn
    lane: int
    path: Path
    desired_speed: float
    s: float = 0.0
    v: float = 0.0
    wait_time: float = 0.0
    spawn_time: float = 0.0

    @property
    def stopped(self) -> bool:
        return self.v < STOPPED_SPEED


class Simulation:
    def __init__(
        self,
        config: IntersectionConfig,
        phases: list[PhaseConfig],
        seed: int = 0,
    ) -> None:
        self.config = config
        self.geometry = IntersectionGeometry(config)
        self.signals = SignalController(phases)
        self.rng = random.Random(seed)
        self.time = 0.0
        self._next_id = 1
        # машины сгруппированы по (въезд, полоса), в списке — от головы к хвосту
        self.lanes: dict[tuple[Direction, int], list[Vehicle]] = {
            (d, lane): []
            for d, approach in config.approaches.items()
            for lane in range(approach.lanes_in)
        }
        self.departed: dict[Direction, int] = {d: 0 for d in config.approaches}
        self.spawned: dict[Direction, int] = {d: 0 for d in config.approaches}
        self.total_wait: dict[Direction, float] = {d: 0.0 for d in config.approaches}

    # --- шаг модели -------------------------------------------------------
    def step(self, dt: float) -> None:
        self.signals.step(dt)
        self._spawn(dt)
        for (direction, _lane), queue in self.lanes.items():
            self._advance_lane(direction, queue, dt)
        self.time += dt

    def _advance_lane(self, direction: Direction, queue: list[Vehicle], dt: float) -> None:
        leader: Vehicle | None = None
        survivors: list[Vehicle] = []
        for vehicle in queue:  # от головы к хвосту
            accel = self._acceleration(vehicle, leader)
            vehicle.v = max(0.0, vehicle.v + accel * dt)
            vehicle.s += vehicle.v * dt
            if vehicle.stopped and vehicle.s < vehicle.path.stop_distance:
                vehicle.wait_time += dt
            if vehicle.s >= vehicle.path.total:
                self.departed[direction] += 1
                self.total_wait[direction] += vehicle.wait_time
                continue
            survivors.append(vehicle)
            leader = vehicle
        queue[:] = survivors

    def _acceleration(self, vehicle: Vehicle, leader: Vehicle | None) -> float:
        v0 = vehicle.desired_speed
        free = A_MAX * (1.0 - (vehicle.v / v0) ** 4)

        braking = 0.0
        if leader is not None:
            gap = leader.s - vehicle.s - VEHICLE_LENGTH
            braking = self._idm_term(vehicle.v, vehicle.v - leader.v, gap)

        if self._must_stop(vehicle):
            gap = vehicle.path.stop_distance - vehicle.s - GAP_MIN * 0.5
            braking = max(braking, self._idm_term(vehicle.v, vehicle.v, gap))

        return max(free - braking, -B_MAX)

    @staticmethod
    def _idm_term(v: float, dv: float, gap: float) -> float:
        if gap <= 0.1:
            return A_MAX * 40.0
        s_star = GAP_MIN + max(0.0, v * HEADWAY + v * dv / (2 * math.sqrt(A_MAX * B_COMFORT)))
        return A_MAX * (s_star / gap) ** 2

    def _must_stop(self, vehicle: Vehicle) -> bool:
        """Красный/жёлтый перед стоп-линией. Уже въехавшие на перекрёсток едут дальше."""
        remaining = vehicle.path.stop_distance - vehicle.s
        if remaining <= 0.0:
            return False
        state = self.signals.state(vehicle.direction, vehicle.turn)
        if state == GREEN:
            return False
        if state == YELLOW:
            # если тормозить уже поздно, проезжаем на жёлтый
            braking_distance = vehicle.v * vehicle.v / (2 * B_COMFORT)
            return remaining > braking_distance
        return True

    # --- появление машин --------------------------------------------------
    def _spawn(self, dt: float) -> None:
        for direction, approach in self.config.approaches.items():
            expected = approach.arrival_rate_vph / 3600.0 * dt
            if self.rng.random() >= expected:
                continue
            turn = self._pick_turn(approach.turn_ratios)
            lane = self._pick_lane(turn, approach.lanes_in)
            queue = self.lanes[(direction, lane)]
            if queue and queue[-1].s < VEHICLE_LENGTH + GAP_MIN * 2:
                continue  # въезд занят: машина не появляется
            path = self.geometry.path(direction, turn, lane)
            vehicle = Vehicle(
                id=self._next_id,
                direction=direction,
                turn=turn,
                lane=lane,
                path=path,
                desired_speed=approach.speed_limit * self.rng.uniform(0.9, 1.1),
                v=approach.speed_limit * 0.8,
                spawn_time=self.time,
            )
            self._next_id += 1
            queue.append(vehicle)
            self.spawned[direction] += 1

    def _pick_turn(self, ratios: dict[str, float]) -> Turn:
        weights = [max(0.0, float(ratios.get(t.value, 0.0))) for t in Turn]
        if sum(weights) <= 0:
            return Turn.STRAIGHT
        return self.rng.choices(list(Turn), weights=weights, k=1)[0]

    def _pick_lane(self, turn: Turn, lanes_in: int) -> int:
        if lanes_in <= 1:
            return 0
        if turn is Turn.LEFT:
            return 0
        if turn is Turn.RIGHT:
            return lanes_in - 1
        return self.rng.randrange(lanes_in)

    # --- выгрузка состояния ----------------------------------------------
    def signal_states(self) -> dict[str, dict[str, str]]:
        return {
            d.value: {t.value: self.signals.state(d, t) for t in Turn}
            for d in self.config.approaches
        }

    def stats(self) -> dict[str, dict[str, float]]:
        out: dict[str, dict[str, float]] = {}
        for direction, approach in self.config.approaches.items():
            queued = sum(
                1
                for lane in range(approach.lanes_in)
                for v in self.lanes[(direction, lane)]
                if v.stopped and v.s < v.path.stop_distance
            )
            departed = self.departed[direction]
            out[direction.value] = {
                "queue": queued,
                "avg_wait": round(self.total_wait[direction] / departed, 2) if departed else 0.0,
                "departed": departed,
                "spawned": self.spawned[direction],
            }
        return out

    def snapshot(self) -> dict:
        vehicles = []
        for (direction, _lane), queue in self.lanes.items():
            for vehicle in queue:
                x, z, heading = vehicle.path.sample(vehicle.s)
                vehicles.append(
                    {
                        "id": vehicle.id,
                        "x": round(x, 2),
                        "z": round(z, 2),
                        "h": round(heading, 3),
                        "v": round(vehicle.v, 2),
                        "d": direction.value,
                        "t": vehicle.turn.value,
                    }
                )
        return {
            "type": "frame",
            "time": round(self.time, 2),
            "phase": {
                "index": self.signals.index,
                "state": self.signals.sub_state,
                "remaining": round(self.signals.remaining, 1),
            },
            "signals": self.signal_states(),
            "vehicles": vehicles,
            "stats": self.stats(),
        }

    def layout(self) -> dict:
        """Статическое описание геометрии: дорога, стоп-линии, мачты светофоров."""
        geo = self.geometry
        approaches = []
        for direction, approach in self.config.approaches.items():
            h = HEADING[direction]
            approaches.append(
                {
                    "direction": direction.value,
                    "heading": [h[0], h[1]],
                    "lanes_in": approach.lanes_in,
                    "lanes_out": approach.lanes_out,
                    "stop_distance": round(geo.clearance(direction), 2),
                    "speed_limit_kmh": approach.speed_limit_kmh,
                }
            )
        return {
            "type": "layout",
            "lane_width": self.config.lane_width,
            "approach_length": self.config.approach_length,
            "half_width_ns": geo.half_width_ns,
            "half_width_ew": geo.half_width_ew,
            "vehicle": {"length": VEHICLE_LENGTH, "width": VEHICLE_WIDTH},
            "approaches": approaches,
        }
