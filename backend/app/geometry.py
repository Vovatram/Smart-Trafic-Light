"""Геометрия перекрёстка: оси полос и траектории машин.

Система координат — правая, вид сверху: X на восток, Z на север, Y вверх
(во фронтенде используется та же тройка, поэтому координаты уходят как есть).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from app.models import Direction, Turn

Vec = tuple[float, float]

# Направление движения машин, въезжающих с соответствующей стороны.
HEADING: dict[Direction, Vec] = {
    Direction.N: (0.0, -1.0),
    Direction.S: (0.0, 1.0),
    Direction.E: (-1.0, 0.0),
    Direction.W: (1.0, 0.0),
}

SIDE_BY_HEADING: dict[Vec, Direction] = {
    (0.0, 1.0): Direction.N,
    (1.0, 0.0): Direction.E,
    (0.0, -1.0): Direction.S,
    (-1.0, 0.0): Direction.W,
}


def right_of(h: Vec) -> Vec:
    """Единичный вектор «вправо» относительно направления движения."""
    return (h[1], -h[0])


def rotate_left(h: Vec) -> Vec:
    return (-h[1], h[0])


def rotate_right(h: Vec) -> Vec:
    return (h[1], -h[0])


@dataclass(slots=True)
class ApproachConfig:
    direction: Direction
    lanes_in: int = 2
    lanes_out: int = 2
    speed_limit_kmh: float = 60.0
    arrival_rate_vph: float = 600.0
    turn_ratios: dict[str, float] = field(
        default_factory=lambda: {"left": 0.2, "straight": 0.6, "right": 0.2}
    )

    @property
    def speed_limit(self) -> float:
        return self.speed_limit_kmh / 3.6


@dataclass(slots=True)
class IntersectionConfig:
    lane_width: float = 3.5
    approach_length: float = 120.0
    approaches: dict[Direction, ApproachConfig] = field(default_factory=dict)

    def approach(self, direction: Direction) -> ApproachConfig:
        return self.approaches[direction]


class IntersectionGeometry:
    """Кэш траекторий: путь зависит только от (въезд, манёвр, полоса)."""

    def __init__(self, config: IntersectionConfig) -> None:
        self.config = config
        self.lane_width = config.lane_width
        self.length = config.approach_length
        self._paths: dict[tuple[Direction, Turn, int], Path] = {}

        w = self.lane_width
        ns = [config.approaches[d] for d in (Direction.N, Direction.S) if d in config.approaches]
        ew = [config.approaches[d] for d in (Direction.E, Direction.W) if d in config.approaches]
        self.half_width_ns = max((max(a.lanes_in, a.lanes_out) for a in ns), default=2) * w
        self.half_width_ew = max((max(a.lanes_in, a.lanes_out) for a in ew), default=2) * w

    def clearance(self, direction: Direction) -> float:
        """Расстояние от центра до стоп-линии данного въезда."""
        crossing = self.half_width_ew if direction in (Direction.N, Direction.S) else self.half_width_ns
        return crossing + 4.0  # запас под пешеходный переход

    def exit_side(self, direction: Direction, turn: Turn) -> Direction:
        h = HEADING[direction]
        he = {Turn.STRAIGHT: h, Turn.LEFT: rotate_left(h), Turn.RIGHT: rotate_right(h)}[turn]
        return SIDE_BY_HEADING[(round(he[0]), round(he[1]))]

    def exit_heading(self, direction: Direction, turn: Turn) -> Vec:
        h = HEADING[direction]
        return {Turn.STRAIGHT: h, Turn.LEFT: rotate_left(h), Turn.RIGHT: rotate_right(h)}[turn]

    def lane_center_offset(self, h: Vec, lane: int) -> Vec:
        r = right_of(h)
        d = (lane + 0.5) * self.lane_width
        return (r[0] * d, r[1] * d)

    def path(self, direction: Direction, turn: Turn, lane: int) -> Path:
        key = (direction, turn, lane)
        cached = self._paths.get(key)
        if cached is None:
            cached = self._build_path(direction, turn, lane)
            self._paths[key] = cached
        return cached

    def exit_lane(self, direction: Direction, turn: Turn, lane: int) -> int:
        side = self.exit_side(direction, turn)
        lanes_out = self.config.approaches[side].lanes_out
        if turn is Turn.LEFT:
            return 0
        if turn is Turn.RIGHT:
            return lanes_out - 1
        return min(lane, lanes_out - 1)

    def _build_path(self, direction: Direction, turn: Turn, lane: int) -> Path:
        h = HEADING[direction]
        off_in = self.lane_center_offset(h, lane)
        stop_d = self.clearance(direction)

        entry = (-h[0] * self.length + off_in[0], -h[1] * self.length + off_in[1])
        stop = (-h[0] * stop_d + off_in[0], -h[1] * stop_d + off_in[1])

        side = self.exit_side(direction, turn)
        he = self.exit_heading(direction, turn)
        out_lane = self.exit_lane(direction, turn, lane)
        off_out = self.lane_center_offset(he, out_lane)
        exit_d = self.clearance(side)
        exit_start = (he[0] * exit_d + off_out[0], he[1] * exit_d + off_out[1])
        exit_end = (he[0] * self.length + off_out[0], he[1] * self.length + off_out[1])

        points: list[Vec] = [entry, stop]
        if turn is Turn.STRAIGHT:
            points.append(exit_start)
        else:
            corner = _line_intersection(stop, h, exit_start, he) or _midpoint(stop, exit_start)
            points.extend(_quadratic_bezier(stop, corner, exit_start, segments=10)[1:])
        points.append(exit_end)
        return Path(points, stop_index=1)


class Path:
    """Ломаная с параметризацией по длине дуги."""

    __slots__ = ("points", "cum", "total", "stop_distance")

    def __init__(self, points: list[Vec], stop_index: int) -> None:
        self.points = points
        self.cum: list[float] = [0.0]
        for a, b in zip(points, points[1:]):
            self.cum.append(self.cum[-1] + math.dist(a, b))
        self.total = self.cum[-1]
        self.stop_distance = self.cum[stop_index]

    def sample(self, s: float) -> tuple[float, float, float]:
        """Возвращает (x, z, курс в радианах) на расстоянии s от начала пути."""
        s = min(max(s, 0.0), self.total)
        i = _segment_index(self.cum, s)
        a, b = self.points[i], self.points[i + 1]
        seg_len = self.cum[i + 1] - self.cum[i]
        t = 0.0 if seg_len <= 1e-9 else (s - self.cum[i]) / seg_len
        x = a[0] + (b[0] - a[0]) * t
        z = a[1] + (b[1] - a[1]) * t
        heading = math.atan2(b[0] - a[0], b[1] - a[1])
        return x, z, heading


def _segment_index(cum: list[float], s: float) -> int:
    lo, hi = 0, len(cum) - 2
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if cum[mid] <= s:
            lo = mid
        else:
            hi = mid - 1
    return lo


def _midpoint(a: Vec, b: Vec) -> Vec:
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def _line_intersection(p: Vec, dp: Vec, q: Vec, dq: Vec) -> Vec | None:
    det = dp[0] * (-dq[1]) - dp[1] * (-dq[0])
    if abs(det) < 1e-9:
        return None
    rx, rz = q[0] - p[0], q[1] - p[1]
    t = (rx * (-dq[1]) - rz * (-dq[0])) / det
    return (p[0] + dp[0] * t, p[1] + dp[1] * t)


def _quadratic_bezier(a: Vec, c: Vec, b: Vec, segments: int) -> list[Vec]:
    out: list[Vec] = []
    for i in range(segments + 1):
        t = i / segments
        u = 1 - t
        out.append(
            (
                u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
                u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
            )
        )
    return out
