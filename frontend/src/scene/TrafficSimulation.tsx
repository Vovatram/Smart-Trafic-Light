import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { RefObject } from "react";

import { api } from "../api/client";
import type { Crossing, PedestrianSignal, SceneSlot, SceneSnapshot, VehicleSignal } from "../types";
import { detectingColors, sensorDevices } from "./detection";
import {
  busLaneIndex,
  carLaneIndices,
  laneCenterX,
  roadGeometry,
  sidewalkX,
  stopMarkerPosition,
  tramLaneIndex,
  type RoadGeometry,
} from "./layout";
import type { ReplayFrame } from "./replay";

const COUNT_BADGE_Y = 2.2;
const SNAPSHOT_INTERVAL_S = 30; // как часто писать снимок интенсивности для графиков
const SCENE_SNAPSHOT_INTERVAL_S = 2; // как часто писать снимок ПОЗИЦИЙ для покадрового replay
// цвет агентов при историческом воспроизведении — детекция сенсоров в
// снимке не записана (только позиции), поэтому раскраска здесь фиксированная;
// трамваи/автобусы/спецтехника в снимки пока не попадают (см. README) —
// раскраска ниже нужна только машинам и пешеходам
const REPLAY_VEHICLE_COLOR = "#94a3b8";
const REPLAY_PED_COLOR = "#38bdf8";

export interface PedCountRefs {
  pedLeft: HTMLDivElement | null;
  pedRight: HTMLDivElement | null;
}

/** Ключи ручного спавна — кнопка "Спавн" в каждой плашке интенсивности (GenerationBadges). */
export type SpawnKind =
  | "forward"
  | "backward"
  | "pedLeft"
  | "pedRight"
  | "special-forward"
  | "special-backward"
  | "tram-forward"
  | "tram-backward"
  | "bus-forward"
  | "bus-backward";

/** Множество "запросов на немедленный спавн" — кладёт GenerationBadges, разбирает и чистит TrafficSimulation за один кадр. */
export type ManualSpawnRef = RefObject<Set<SpawnKind>>;

/** Текстовый бейдж, который сам меняет содержимое через ref — без React state. */
function CountBadge({
  x,
  z,
  refCb,
}: {
  x: number;
  z: number;
  refCb: (el: HTMLDivElement | null) => void;
}) {
  return (
    <Html position={[x, COUNT_BADGE_Y, z]} center>
      <div
        ref={refCb}
        className="rounded-full border border-slate-600 bg-slate-900/90 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-100 shadow-lg"
      >
        0
      </div>
    </Html>
  );
}

const CAR_SPEED = 8; // м/с
const PED_SPEED = 2.6; // м/с — заметно быстрый шаг для наглядности сцены
const CAR_POOL = 24;
const PED_POOL = 24;
const CAR_LENGTH = 4.4;
const CAR_WIDTH = 1.8;
const PED_DEPTH = 0.4;
const PED_WIDTH = 0.5;
const CAR_MIN_GAP = 6.5; // м — минимальная дистанция до идущей впереди машины в той же полосе
const PED_MIN_GAP = 1.0; // м — то же самое для пешеходов на одной "дорожке"
const LANE_EPS = 0.5; // допуск, чтобы считать двух агентов "в одной полосе"
const HIDDEN_COLOR = "#334155"; // цвет "по умолчанию" — виден только пока идёт transition, реально не рендерится

// трамвай/автобус едут по своей выделенной полосе (если она включена),
// спецтехника — по обычным полосам вместе с машинами. MIN_GAP у каждого
// заметно больше его собственной длины (как у машин: 6.5 > 4.4) — иначе при
// очереди на красный агенты считаются "далеко друг от друга" ещё до того,
// как их кузова реально перестанут перекрываться, и визуально сталкиваются.
const TRAM_POOL = 4;
const TRAM_SPEED = 7;
const TRAM_LENGTH = 16;
const TRAM_WIDTH = 2.4;
const TRAM_MIN_GAP = 20;

const BUS_POOL = 6;
const BUS_SPEED = 8;
const BUS_LENGTH = 11;
const BUS_WIDTH = 2.5;
const BUS_MIN_GAP = 15;

const SPECIAL_POOL = 6;
const SPECIAL_SPEED = 11;
const SPECIAL_LENGTH = 5.2;
const SPECIAL_WIDTH = 2.0;
const SPECIAL_MIN_GAP = 7;

const DWELL_SECONDS = 20; // сколько трамвай/автобус стоит на своей остановке

/** Слот пула: переиспользуемое состояние одного агента (машины или пешехода). */
interface Slot {
  active: boolean;
  x: number;
  z: number;
  /** направление движения: для машин вдоль Z, для пешеходов вдоль X */
  dir: 1 | -1;
  /** уже отстоял на своей остановке (чтобы не запускать повторно) — используют только трамвай/автобус */
  dwelled: boolean;
  /** секунд осталось стоять на остановке; > 0 — агент не двигается */
  dwellUntil: number;
}

function makePool(n: number): Slot[] {
  return Array.from({ length: n }, () => ({
    active: false,
    x: 0,
    z: 0,
    dir: 1,
    dwelled: false,
    dwellUntil: 0,
  }));
}

/**
 * Общий спавн для машин/трамваев/автобусов/спецтехники — отличаются только
 * тем, В КАКИХ полосах им можно появиться (обычные машины и спецтехника —
 * во всех "автомобильных", трамвай/автобус — строго в своей выделенной).
 *
 * forceForward/forceBackward — кнопка "Спавн" в панели интенсивности:
 * спавнит одного агента немедленно, не дожидаясь вероятностного тика и
 * даже если интенсивность выставлена в 0 (это явный ручной запрос, а не
 * "естественный" поток).
 */
function trySpawnInLanes(
  pool: Slot[],
  geo: RoadGeometry,
  forwardLanes: number[],
  backwardLanes: number[],
  vphForward: number,
  vphBackward: number,
  dt: number,
  forceForward = false,
  forceBackward = false,
) {
  if (forwardLanes.length > 0 && (forceForward || (vphForward > 0 && Math.random() < (vphForward / 3600) * dt))) {
    const slot = pool.find((s) => !s.active);
    if (slot) {
      const lane = forwardLanes[Math.floor(Math.random() * forwardLanes.length)];
      slot.active = true;
      slot.dir = 1;
      slot.x = laneCenterX(geo, "forward", lane);
      slot.z = -geo.roadLength;
      slot.dwelled = false;
      slot.dwellUntil = 0;
    }
  }
  if (
    backwardLanes.length > 0 &&
    (forceBackward || (vphBackward > 0 && Math.random() < (vphBackward / 3600) * dt))
  ) {
    const slot = pool.find((s) => !s.active);
    if (slot) {
      const lane = backwardLanes[Math.floor(Math.random() * backwardLanes.length)];
      slot.active = true;
      slot.dir = -1;
      slot.x = laneCenterX(geo, "backward", lane);
      slot.z = geo.roadLength;
      slot.dwelled = false;
      slot.dwellUntil = 0;
    }
  }
}

const PED_SPAWN_MARGIN = 1.0; // ближайший к бордюру край площадки ожидания
const PED_SPAWN_DEPTH = 2.0; // насколько вглубь тротуара разбросан спавн
const PED_SPAWN_HALF_WIDTH_EXTRA = 1.0; // площадка чуть шире самого перехода

function trySpawnPeds(
  pool: Slot[],
  geo: RoadGeometry,
  crossing: Crossing,
  dt: number,
  forceLeft = false,
  forceRight = false,
) {
  const halfWidth = geo.crossingWidth / 2 + PED_SPAWN_HALF_WIDTH_EXTRA;
  if (forceLeft || (crossing.peds_left_vph > 0 && Math.random() < (crossing.peds_left_vph / 3600) * dt)) {
    const slot = pool.find((s) => !s.active);
    if (slot) {
      slot.active = true;
      slot.dir = 1;
      // площадка перед переходом, а не линия: разброс и вглубь тротуара, и вдоль дороги
      slot.x = geo.leftEdge - PED_SPAWN_MARGIN - Math.random() * PED_SPAWN_DEPTH;
      slot.z = (Math.random() - 0.5) * 2 * halfWidth;
    }
  }
  if (forceRight || (crossing.peds_right_vph > 0 && Math.random() < (crossing.peds_right_vph / 3600) * dt)) {
    const slot = pool.find((s) => !s.active);
    if (slot) {
      slot.active = true;
      slot.dir = -1;
      slot.x = geo.rightEdge + PED_SPAWN_MARGIN + Math.random() * PED_SPAWN_DEPTH;
      slot.z = (Math.random() - 0.5) * 2 * halfWidth;
    }
  }
}

/**
 * Урезает желаемую скорость до 0, если впереди в той же полосе (тот же dir,
 * та же "боковая" координата с точностью LANE_EPS) слишком близко другой
 * активный агент — простая очередь без формул IDM, но без наложения машин
 * друг на друга у стоп-линии. obstacles — не обязательно тот же пул, что
 * движется: машины и спецтехника делят одни и те же полосы, поэтому должны
 * видеть друг друга как препятствие, а не только агентов своего типа.
 */
function gapLimitedSpeed(obstacles: Slot[], self: Slot, axis: "x" | "z", desired: number, minGap: number): number {
  if (desired === 0) return 0;
  let nearestGap = Infinity;
  for (const other of obstacles) {
    if (other === self || !other.active || other.dir !== self.dir) continue;
    const lateral = axis === "z" ? other.x - self.x : other.z - self.z;
    if (Math.abs(lateral) > LANE_EPS) continue;
    const primary = axis === "z" ? other.z - self.z : other.x - self.x;
    const ahead = self.dir > 0 ? primary : -primary;
    if (ahead > 0 && ahead < nearestGap) nearestGap = ahead;
  }
  return nearestGap < minGap ? 0 : desired;
}

/** На какой Z и на сколько секунд встать — считается один раз в кадр в TrafficSimulation, передаётся сюда. */
interface DwellConfig {
  forwardStop: number | null;
  backwardStop: number | null;
  seconds: number;
}

/**
 * Двигает агента вдоль его оси на gap-limited скорости и, если сигнал не
 * пускает и он ещё не пересёк границу (gate, симметрично ±gate от центра),
 * не даёт ему проехать дальше неё — сама скорость при этом не трогается,
 * поэтому агент едет к границе нормально и тормозит уже вплотную к ней, а
 * не сразу при спавне. Тот, кто уже за границей, идёт дальше без ограничений.
 *
 * dwell (только трамвай/автобус) — если агент впервые достиг координаты
 * своей остановки, он замирает на dwell.seconds секунд (обычное движение и
 * gap-check в эти кадры не считаются — он просто стоит, как и положено
 * агенту, ожидающему своей очереди позади).
 */
function advanceWithGate(
  pool: Slot[],
  obstacles: Slot[],
  dt: number,
  axis: "x" | "z",
  speed: number,
  minGap: number,
  go: boolean,
  gate: number,
  bound: { min: number; max: number },
  dwell?: DwellConfig,
) {
  for (const s of pool) {
    if (!s.active) continue;

    if (dwell) {
      const stopAt = s.dir > 0 ? dwell.forwardStop : dwell.backwardStop;
      if (!s.dwelled && stopAt !== null) {
        const reached = s.dir > 0 ? s.z >= stopAt : s.z <= stopAt;
        if (reached) {
          s.dwelled = true;
          s.dwellUntil = dwell.seconds;
        }
      }
      if (s.dwellUntil > 0) {
        s.dwellUntil = Math.max(0, s.dwellUntil - dt);
        continue; // стоит на остановке — не двигаем в этом кадре
      }
    }

    const coord = axis === "z" ? s.z : s.x;
    // строго ">" / "<": стоя ровно на линии агент ещё не "пересёк" её — иначе
    // на кадре после остановки coord === -gate и "уже пересёк" пускает его дальше
    const crossedGate = s.dir > 0 ? coord > -gate : coord < gate;
    const limited = gapLimitedSpeed(obstacles, s, axis, speed, minGap);
    let next = coord + s.dir * limited * dt;
    if (!go && !crossedGate) {
      next = s.dir > 0 ? Math.min(next, -gate) : Math.max(next, gate);
    }
    if (axis === "z") s.z = next;
    else s.x = next;
    if (next > bound.max || next < bound.min) s.active = false;
  }
}

/**
 * Машины/трамваи/автобусы/спецтехника продолжают появляться и ехать даже на
 * красный — просто тормозят перед стоп-линией (crossingHalf + stopOffset от
 * центра) и ждут зелёного. Кто уже проехал эту границу, доезжает переход не
 * останавливаясь.
 *
 * gate считается по координате ПЕРЕДНЕГО бампера, а не центра машины —
 * иначе центр стоит перед линией, а капот (половина длины) торчит почти до
 * середины перехода. Добавляем половину длины кузова к отступу — своей для
 * каждого типа техники (трамвай/автобус длиннее обычной машины).
 */
function advanceVehicles(
  pool: Slot[],
  obstacles: Slot[],
  length: number,
  speed: number,
  minGap: number,
  green: boolean,
  dt: number,
  geo: RoadGeometry,
  dwell?: DwellConfig,
) {
  const stopZ = geo.crossingHalf + geo.stopOffset + length / 2;
  advanceWithGate(
    pool,
    obstacles,
    dt,
    "z",
    speed,
    minGap,
    green,
    stopZ,
    { min: -geo.roadLength, max: geo.roadLength },
    dwell,
  );
}

/**
 * Пешеходы так же продолжают выходить на тротуар и на красный — но
 * останавливаются на границе проезжей части. Кто уже ступил на переход,
 * когда сигнал был "идите", договаривает его до конца при любом сигнале.
 */
const ARRIVAL_EPS = 0.05; // насколько точно нужно упереться в gate, чтобы считать "подошёл"

/**
 * @param onWaiting — вызывается, когда пешеход реально дошёл до края
 * проезжей части и стоит там (не может пройти, сигнал не "идите"); в
 * режиме "Кнопка" это автоматически "нажимает" кнопку вызова.
 */
function advancePeds(
  pool: Slot[],
  walk: boolean,
  dt: number,
  geo: RoadGeometry,
  onWaiting?: () => void,
) {
  // "граница дороги" в терминах gate — расстояние от центра (0) до края
  // проезжей части ближе к её "своей" стороне (leftEdge/rightEdge — со
  // знаком, gate в advanceWithGate считается симметрично от 0)
  // тот же сдвиг на половину "длины" тела, что и у машин — иначе передняя
  // нога пешехода заступает на дорогу раньше, чем его центр дойдёт до края
  const gateLeft = -geo.leftEdge + PED_DEPTH / 2; // leftEdge отрицательный — переводим в положительную "дистанцию от 0"
  const gateRight = geo.rightEdge + PED_DEPTH / 2;
  // площадки спавна разной глубины слева/справа возможны при разных lane-counts,
  // поэтому despawn считаем по каждой стороне отдельно, а не общим gate
  const spawnDepth = PED_SPAWN_MARGIN + PED_SPAWN_DEPTH;
  const rightBound = geo.rightEdge + spawnDepth + 1;
  const leftBound = geo.leftEdge - spawnDepth - 1;

  for (const s of pool) {
    if (!s.active) continue;
    const gate = s.dir > 0 ? gateLeft : gateRight;
    const crossedGate = s.dir > 0 ? s.x > -gateLeft : s.x < gateRight;
    const limited = gapLimitedSpeed(pool, s, "x", PED_SPEED, PED_MIN_GAP);
    let next = s.x + s.dir * limited * dt;
    if (!walk && !crossedGate) {
      const gatePos = s.dir > 0 ? -gate : gate;
      next = s.dir > 0 ? Math.min(next, gatePos) : Math.max(next, gatePos);
      if (Math.abs(next - gatePos) < ARRIVAL_EPS) onWaiting?.();
    }
    s.x = next;
    if (s.x > rightBound || s.x < leftBound) s.active = false;
  }
}

/** Два полу-блока рядом — так объект можно покрасить в 1 или 2 цвета сразу. */
function TwoTonePod({
  width,
  height,
  depth,
  y,
  refA,
  refB,
}: {
  width: number;
  height: number;
  depth: number;
  y: number;
  refA: (el: THREE.Mesh | null) => void;
  refB: (el: THREE.Mesh | null) => void;
}) {
  const half = width / 2;
  return (
    <>
      <mesh ref={refA} position={[-width / 4, y, 0]} castShadow>
        <boxGeometry args={[half, height, depth]} />
        <meshStandardMaterial color={HIDDEN_COLOR} roughness={0.5} />
      </mesh>
      <mesh ref={refB} position={[width / 4, y, 0]} castShadow>
        <boxGeometry args={[half, height, depth]} />
        <meshStandardMaterial color={HIDDEN_COLOR} roughness={0.5} />
      </mesh>
    </>
  );
}

function applyDetection(
  slot: Slot,
  group: THREE.Group | null,
  halfA: THREE.Mesh | null,
  halfB: THREE.Mesh | null,
  sensors: ReturnType<typeof sensorDevices>,
  allDevices: Crossing["its_devices"],
  axis: "x" | "z",
) {
  if (!group) return;
  if (!slot.active) {
    group.visible = false;
    return;
  }
  const colors = detectingColors(sensors, allDevices, slot.x, slot.z);
  if (colors.length === 0) {
    group.visible = false;
    return;
  }
  group.visible = true;
  group.position.set(slot.x, 0, slot.z);
  group.rotation.y =
    axis === "z" ? (slot.dir > 0 ? 0 : Math.PI) : slot.dir > 0 ? Math.PI / 2 : -Math.PI / 2;

  const colorA = colors[0];
  const colorB = colors.length > 1 ? colors[1] : colors[0];
  if (halfA) (halfA.material as THREE.MeshStandardMaterial).color.set(colorA);
  if (halfB) (halfB.material as THREE.MeshStandardMaterial).color.set(colorB);
}

/**
 * Отрисовка слота из записанного снимка (историческое воспроизведение) —
 * без детекции сенсоров (она не записывается), фиксированным цветом.
 */
function applyReplaySlot(
  entry: SceneSnapshot["cars"][number],
  group: THREE.Group | null,
  halfA: THREE.Mesh | null,
  halfB: THREE.Mesh | null,
  axis: "x" | "z",
  color: string,
) {
  if (!group) return;
  if (!entry) {
    group.visible = false;
    return;
  }
  const [x, z, dir] = entry;
  group.visible = true;
  group.position.set(x, 0, z);
  group.rotation.y = axis === "z" ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  if (halfA) (halfA.material as THREE.MeshStandardMaterial).color.set(color);
  if (halfB) (halfB.material as THREE.MeshStandardMaterial).color.set(color);
}

/**
 * Процедурная генерация машин и пешеходов: спавн по интенсивности (в час) с
 * каждого из 4 "начал", движение только на зелёный/"идите", отрисовка —
 * только пока агент виден хотя бы одному датчику (камере/микроволновому),
 * цветом этого датчика (двумя цветами, если видят двое).
 */
export function TrafficSimulation({
  crossing,
  vehicleSignal,
  pedestrianSignal,
  onPedestrianWaiting,
  showCounts,
  selectedSensorIds,
  replay,
  pedCountRef,
  manualSpawnRef,
}: {
  crossing: Crossing;
  /** живой сигнал из useSignalState — не обязательно crossing.vehicle_signal (тот стоит только в manual) */
  vehicleSignal: VehicleSignal;
  pedestrianSignal: PedestrianSignal;
  /** пешеход подошёл к переходу и ждёт — в режиме "Кнопка" это авто-нажатие вызова */
  onPedestrianWaiting?: () => void;
  /** живые счётчики машин/пешеходов по направлениям — видны, пока открыта панель "Режим светофора" */
  showCounts?: boolean;
  /** если не пусто — показываются только машины/пешеходы, видимые ЭТИМ(и) датчиком(ами) */
  selectedSensorIds?: ReadonlySet<number>;
  /** не пусто — сцена показывает записанный исторический кадр вместо живой симуляции
   * (сама симуляция при этом продолжает идти в фоне не прерываясь — просто не рисуется) */
  replay?: ReplayFrame | null;
  /** сюда пишутся живые счётчики пешеходов слева/справа — их читает бейдж
   * "Пешеходный" на светофоре (третья строка, под секундами), см. SignalStatusBadge */
  pedCountRef?: RefObject<PedCountRefs>;
  /** запросы кнопки "Спавн" из GenerationBadges — разбираются и очищаются за один кадр */
  manualSpawnRef?: ManualSpawnRef;
}) {
  const geo = useMemo(() => roadGeometry(crossing), [crossing]);
  const allSensors = useMemo(() => sensorDevices(crossing.its_devices), [crossing.its_devices]);
  const sensors = useMemo(
    () =>
      selectedSensorIds && selectedSensorIds.size > 0
        ? allSensors.filter((d) => selectedSensorIds.has(d.id))
        : allSensors,
    [allSensors, selectedSensorIds],
  );
  const stopZ = geo.crossingHalf + geo.stopOffset;

  const cars = useRef<Slot[]>(makePool(CAR_POOL));
  const peds = useRef<Slot[]>(makePool(PED_POOL));
  const trams = useRef<Slot[]>(makePool(TRAM_POOL));
  const buses = useRef<Slot[]>(makePool(BUS_POOL));
  const specials = useRef<Slot[]>(makePool(SPECIAL_POOL));
  const countRefs = useRef<{
    forward: HTMLDivElement | null;
    backward: HTMLDivElement | null;
    pedLeft: HTMLDivElement | null;
    pedRight: HTMLDivElement | null;
  }>({ forward: null, backward: null, pedLeft: null, pedRight: null });
  const snapshotElapsed = useRef(0);
  const sceneSnapshotElapsed = useRef(0);

  const carGroups = useRef<(THREE.Group | null)[]>([]);
  const carHalvesA = useRef<(THREE.Mesh | null)[]>([]);
  const carHalvesB = useRef<(THREE.Mesh | null)[]>([]);
  const pedGroups = useRef<(THREE.Group | null)[]>([]);
  const pedHalvesA = useRef<(THREE.Mesh | null)[]>([]);
  const pedHalvesB = useRef<(THREE.Mesh | null)[]>([]);
  const tramGroups = useRef<(THREE.Group | null)[]>([]);
  const tramHalvesA = useRef<(THREE.Mesh | null)[]>([]);
  const tramHalvesB = useRef<(THREE.Mesh | null)[]>([]);
  const busGroups = useRef<(THREE.Group | null)[]>([]);
  const busHalvesA = useRef<(THREE.Mesh | null)[]>([]);
  const busHalvesB = useRef<(THREE.Mesh | null)[]>([]);
  const specialGroups = useRef<(THREE.Group | null)[]>([]);
  const specialHalvesA = useRef<(THREE.Mesh | null)[]>([]);
  const specialHalvesB = useRef<(THREE.Mesh | null)[]>([]);
  const specialBeacons = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    // маячок спецтехники — мигает красным/синим независимо от детекции и replay
    const beaconOn = Math.floor(state.clock.elapsedTime * 4) % 2 === 0;
    const beaconColor = beaconOn ? "#ef4444" : "#2563eb";
    for (const mesh of specialBeacons.current) {
      if (mesh) (mesh.material as THREE.MeshStandardMaterial).emissive.set(beaconColor);
    }
    const carLanesFwd = carLaneIndices(geo, "forward");
    const carLanesBack = carLaneIndices(geo, "backward");

    // разбираем и сразу очищаем запросы кнопки "Спавн" — каждый обрабатывается ровно один раз
    const manual = manualSpawnRef?.current;
    const consume = (kind: SpawnKind): boolean => {
      if (!manual?.has(kind)) return false;
      manual.delete(kind);
      return true;
    };
    const forceForward = consume("forward");
    const forceBackward = consume("backward");
    const forcePedLeft = consume("pedLeft");
    const forcePedRight = consume("pedRight");
    const forceSpecialFwd = consume("special-forward");
    const forceSpecialBack = consume("special-backward");
    const forceTramFwd = consume("tram-forward");
    const forceTramBack = consume("tram-backward");
    const forceBusFwd = consume("bus-forward");
    const forceBusBack = consume("bus-backward");

    const tramDwell: DwellConfig = {
      forwardStop: geo.hasTramForward
        ? stopMarkerPosition(geo, "forward", tramLaneIndex(), geo.tramStopForward)?.z ?? null
        : null,
      backwardStop: geo.hasTramBackward
        ? stopMarkerPosition(geo, "backward", tramLaneIndex(), geo.tramStopBackward)?.z ?? null
        : null,
      seconds: DWELL_SECONDS,
    };
    const busDwell: DwellConfig = {
      forwardStop: geo.hasBusForward
        ? stopMarkerPosition(geo, "forward", busLaneIndex(geo, "forward"), geo.busStopForward)?.z ?? null
        : null,
      backwardStop: geo.hasBusBackward
        ? stopMarkerPosition(geo, "backward", busLaneIndex(geo, "backward"), geo.busStopBackward)?.z ?? null
        : null,
      seconds: DWELL_SECONDS,
    };

    trySpawnInLanes(
      cars.current,
      geo,
      carLanesFwd,
      carLanesBack,
      crossing.vph_forward,
      crossing.vph_backward,
      dt,
      forceForward,
      forceBackward,
    );
    trySpawnInLanes(
      specials.current,
      geo,
      carLanesFwd,
      carLanesBack,
      crossing.special_vph_forward,
      crossing.special_vph_backward,
      dt,
      forceSpecialFwd,
      forceSpecialBack,
    );
    trySpawnInLanes(
      trams.current,
      geo,
      geo.hasTramForward ? [tramLaneIndex()] : [],
      geo.hasTramBackward ? [tramLaneIndex()] : [],
      crossing.tram_vph_forward,
      crossing.tram_vph_backward,
      dt,
      forceTramFwd,
      forceTramBack,
    );
    trySpawnInLanes(
      buses.current,
      geo,
      geo.hasBusForward ? [busLaneIndex(geo, "forward")] : [],
      geo.hasBusBackward ? [busLaneIndex(geo, "backward")] : [],
      crossing.bus_vph_forward,
      crossing.bus_vph_backward,
      dt,
      forceBusFwd,
      forceBusBack,
    );
    trySpawnPeds(peds.current, geo, crossing, dt, forcePedLeft, forcePedRight);

    const green = vehicleSignal === "green";
    // машины и спецтехника делят одни и те же полосы — гап друг для друга
    // считается по ОБЪЕДИНЁННОМУ списку, иначе спецтехника проезжает машины
    // насквозь (и наоборот), как будто их вовсе нет
    const carLaneObstacles = [...cars.current, ...specials.current];
    advanceVehicles(cars.current, carLaneObstacles, CAR_LENGTH, CAR_SPEED, CAR_MIN_GAP, green, dt, geo);
    advanceVehicles(specials.current, carLaneObstacles, SPECIAL_LENGTH, SPECIAL_SPEED, SPECIAL_MIN_GAP, green, dt, geo);
    advanceVehicles(
      trams.current,
      trams.current,
      TRAM_LENGTH,
      TRAM_SPEED,
      TRAM_MIN_GAP,
      green,
      dt,
      geo,
      tramDwell,
    );
    advanceVehicles(
      buses.current,
      buses.current,
      BUS_LENGTH,
      BUS_SPEED,
      BUS_MIN_GAP,
      green,
      dt,
      geo,
      busDwell,
    );
    advancePeds(peds.current, pedestrianSignal === "walk", dt, geo, onPedestrianWaiting);

    // историческое воспроизведение подменяет ТОЛЬКО отрисовку — сама
    // симуляция (cars.current/peds.current/... ) продолжает идти в фоне,
    // чтобы после закрытия истории продолжить без разрыва и чтобы снимки
    // для будущего replay продолжали писаться. Трамваи/автобусы/спецтехника
    // в снимки пока не попадают — на время replay они просто скрыты, а не
    // показывают неверную "текущую" позицию.
    if (replay) {
      carGroups.current.forEach((_, i) =>
        applyReplaySlot(
          replay.cars[i] ?? null,
          carGroups.current[i],
          carHalvesA.current[i],
          carHalvesB.current[i],
          "z",
          REPLAY_VEHICLE_COLOR,
        ),
      );
      pedGroups.current.forEach((_, i) =>
        applyReplaySlot(
          replay.peds[i] ?? null,
          pedGroups.current[i],
          pedHalvesA.current[i],
          pedHalvesB.current[i],
          "x",
          REPLAY_PED_COLOR,
        ),
      );
      for (const g of tramGroups.current) if (g) g.visible = false;
      for (const g of busGroups.current) if (g) g.visible = false;
      for (const g of specialGroups.current) if (g) g.visible = false;
    } else {
      cars.current.forEach((slot, i) =>
        applyDetection(
          slot,
          carGroups.current[i],
          carHalvesA.current[i],
          carHalvesB.current[i],
          sensors,
          crossing.its_devices,
          "z",
        ),
      );
      peds.current.forEach((slot, i) =>
        applyDetection(
          slot,
          pedGroups.current[i],
          pedHalvesA.current[i],
          pedHalvesB.current[i],
          sensors,
          crossing.its_devices,
          "x",
        ),
      );
      trams.current.forEach((slot, i) =>
        applyDetection(slot, tramGroups.current[i], tramHalvesA.current[i], tramHalvesB.current[i], sensors, crossing.its_devices, "z"),
      );
      buses.current.forEach((slot, i) =>
        applyDetection(slot, busGroups.current[i], busHalvesA.current[i], busHalvesB.current[i], sensors, crossing.its_devices, "z"),
      );
      specials.current.forEach((slot, i) =>
        applyDetection(
          slot,
          specialGroups.current[i],
          specialHalvesA.current[i],
          specialHalvesB.current[i],
          sensors,
          crossing.its_devices,
          "z",
        ),
      );
    }

    // считаем всегда (дёшево — просто проход по двум пулам), а не только
    // при showCounts: снимок для графиков интенсивности пишется независимо
    // от того, открыта ли панель "Режим светофора"
    let forward = 0;
    let backward = 0;
    let pedLeft = 0;
    let pedRight = 0;
    for (const s of cars.current) if (s.active) (s.dir > 0 ? forward++ : backward++);
    for (const s of peds.current) if (s.active) (s.dir > 0 ? pedLeft++ : pedRight++);

    if (showCounts) {
      // textContent напрямую, без React state — четыре бейджа не стоят лишнего ре-рендера
      if (countRefs.current.forward) countRefs.current.forward.textContent = String(forward);
      if (countRefs.current.backward) countRefs.current.backward.textContent = String(backward);
      if (countRefs.current.pedLeft) countRefs.current.pedLeft.textContent = String(pedLeft);
      if (countRefs.current.pedRight) countRefs.current.pedRight.textContent = String(pedRight);
    }
    // отдельно от showCounts — эту пару читает бейдж "Пешеходный" на самом
    // светофоре (третья строка под секундами), у него своя логика видимости
    if (pedCountRef?.current) {
      if (pedCountRef.current.pedLeft) pedCountRef.current.pedLeft.textContent = `${pedLeft} чел`;
      if (pedCountRef.current.pedRight) pedCountRef.current.pedRight.textContent = `${pedRight} чел`;
    }

    snapshotElapsed.current += dt;
    if (snapshotElapsed.current >= SNAPSHOT_INTERVAL_S) {
      snapshotElapsed.current = 0;
      void api
        .addMetricSnapshot(crossing.id, {
          forward_count: forward,
          backward_count: backward,
          ped_left_count: pedLeft,
          ped_right_count: pedRight,
        })
        .catch(() => {});
    }

    // снимок ПОЗИЦИЙ — для покадрового replay в таймлайне; пишем всегда,
    // из живого пула (не из replay), даже если сейчас сам показан replay
    sceneSnapshotElapsed.current += dt;
    if (sceneSnapshotElapsed.current >= SCENE_SNAPSHOT_INTERVAL_S) {
      sceneSnapshotElapsed.current = 0;
      const toSlot = (s: Slot): SceneSlot =>
        s.active ? [Math.round(s.x * 100) / 100, Math.round(s.z * 100) / 100, s.dir] : null;
      void api
        .addSceneSnapshot(crossing.id, {
          vehicle_signal: vehicleSignal,
          pedestrian_signal: pedestrianSignal,
          cars: cars.current.map(toSlot),
          peds: peds.current.map(toSlot),
        })
        .catch(() => {});
    }
  });

  return (
    <group>
      {Array.from({ length: CAR_POOL }).map((_, i) => (
        <group key={`car-${i}`} ref={(el) => (carGroups.current[i] = el)} visible={false}>
          <TwoTonePod
            width={CAR_WIDTH}
            height={1.0}
            depth={CAR_LENGTH}
            y={0.58}
            refA={(el) => (carHalvesA.current[i] = el)}
            refB={(el) => (carHalvesB.current[i] = el)}
          />
        </group>
      ))}
      {Array.from({ length: PED_POOL }).map((_, i) => (
        <group key={`ped-${i}`} ref={(el) => (pedGroups.current[i] = el)} visible={false}>
          <TwoTonePod
            width={PED_WIDTH}
            height={1.6}
            depth={PED_DEPTH}
            y={0.8}
            refA={(el) => (pedHalvesA.current[i] = el)}
            refB={(el) => (pedHalvesB.current[i] = el)}
          />
        </group>
      ))}
      {Array.from({ length: TRAM_POOL }).map((_, i) => (
        <group key={`tram-${i}`} ref={(el) => (tramGroups.current[i] = el)} visible={false}>
          <TwoTonePod
            width={TRAM_WIDTH}
            height={2.4}
            depth={TRAM_LENGTH}
            y={1.2}
            refA={(el) => (tramHalvesA.current[i] = el)}
            refB={(el) => (tramHalvesB.current[i] = el)}
          />
        </group>
      ))}
      {Array.from({ length: BUS_POOL }).map((_, i) => (
        <group key={`bus-${i}`} ref={(el) => (busGroups.current[i] = el)} visible={false}>
          <TwoTonePod
            width={BUS_WIDTH}
            height={2.2}
            depth={BUS_LENGTH}
            y={1.1}
            refA={(el) => (busHalvesA.current[i] = el)}
            refB={(el) => (busHalvesB.current[i] = el)}
          />
        </group>
      ))}
      {Array.from({ length: SPECIAL_POOL }).map((_, i) => (
        <group key={`special-${i}`} ref={(el) => (specialGroups.current[i] = el)} visible={false}>
          <TwoTonePod
            width={SPECIAL_WIDTH}
            height={1.4}
            depth={SPECIAL_LENGTH}
            y={0.7}
            refA={(el) => (specialHalvesA.current[i] = el)}
            refB={(el) => (specialHalvesB.current[i] = el)}
          />
          {/* маячок — цвет мигает в useFrame, независимо от раскраски детекции */}
          <mesh ref={(el) => (specialBeacons.current[i] = el)} position={[0, 1.55, 0]}>
            <sphereGeometry args={[0.14, 8, 8]} />
            <meshStandardMaterial color="#1c1c1c" emissive="#ef4444" emissiveIntensity={3} />
          </mesh>
        </group>
      ))}
      {showCounts && (
        <>
          {geo.lanesForward > 0 && (
            <CountBadge
              x={geo.leftEdge / 2}
              z={-stopZ / 2}
              refCb={(el) => (countRefs.current.forward = el)}
            />
          )}
          {geo.lanesBackward > 0 && (
            <CountBadge
              x={geo.rightEdge / 2}
              z={stopZ / 2}
              refCb={(el) => (countRefs.current.backward = el)}
            />
          )}
          <CountBadge
            x={sidewalkX(geo, "left")}
            z={0}
            refCb={(el) => (countRefs.current.pedLeft = el)}
          />
          <CountBadge
            x={sidewalkX(geo, "right")}
            z={0}
            refCb={(el) => (countRefs.current.pedRight = el)}
          />
        </>
      )}
    </group>
  );
}
