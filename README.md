# SmartTrafficLight

3D-визуализация пешеходного перехода через дорогу.

- **БД** — PostgreSQL 18 (параметры перехода: число полос, ширина, состояние светофоров)
- **Бэкенд** — FastAPI + SQLAlchemy 2.0 (async, psycopg3) + Alembic
- **Фронтенд** — React 19 + Vite + Tailwind 4 (`@tailwindcss/vite`) + react-three-fiber

Дорога — прямой участок с пешеходным переходом посередине. У каждого
направления полосы лежат со своей правой стороны по ходу движения —
правостороннее движение. N и K независимо меняются от 0 до 5 через панель
справа, разметка и столбы со светофорами (автомобильный + пешеходный на
каждом) пересчитываются сразу. Отдельно можно добавить один или несколько
столбов с камерой наблюдения — у каждого настраивается сторона дороги,
высота и поворот.

## Структура

```
backend/
  app/
    api/crossings.py   REST-роуты перехода
    models.py           таблица crossings
    schemas.py           Pydantic-схемы
    seed.py               демо-переход
  alembic/                миграции
  run.py                   точка входа для Windows (см. ниже, почему не `-m uvicorn`)
frontend/
  src/
    scene/                3D-сцена (дорога, разметка, столбы со светофорами)
    components/            панели интерфейса
```

## Запуск

### 1. База данных

```sql
CREATE ROLE backend LOGIN PASSWORD '...';
CREATE DATABASE "SmartTraficLight" OWNER backend;
```

### 2. Бэкенд

```bash
cd backend
py -3.14 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
cp .env.example .env          # вписать пароль пользователя backend
.venv/Scripts/alembic upgrade head
.venv/Scripts/python -m app.seed
.venv/Scripts/python run.py
```

API: http://localhost:8000/api/health, документация: http://localhost:8000/docs

> **Windows:** запускать именно `python run.py`, а не `python -m uvicorn app.main:app`.
> `psycopg` в async-режиме несовместим с `ProactorEventLoop`, который Windows
> выбирает по умолчанию — `run.py` переключает политику на
> `WindowsSelectorEventLoopPolicy` до того, как uvicorn создаст свой event
> loop; через `-m uvicorn` app-модуль импортируется уже после этого момента,
> и переключать поздно.

### 3. Фронтенд

```bash
cd frontend
npm install
npm run dev
```

Интерфейс: http://localhost:5173 (запросы `/api` проксируются на бэкенд).

## Система координат

Дорога идёт вдоль оси **Z**, ось **X** — поперёк, **Y** — вверх (правая тройка,
как в three.js); переход — зона вокруг Z = 0. Правостороннее движение: для
машины, едущей в сторону +Z, «право» — это -X (правило правой руки:
`right = (-Fz, 0, Fx)` для вектора движения F); для машины, едущей в сторону
-Z, «право» — это +X. Поэтому полосы направления N (едут в сторону +Z) лежат
при X < 0, полосы направления K (едут в сторону -Z) — при X > 0. Столбы
светофоров и камер стоят снаружи проезжей части, их X пересчитывается из
текущего числа полос — см. `frontend/src/scene/layout.ts`.

## API

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/api/crossings` | список переходов |
| `POST` | `/api/crossings` | создать переход |
| `GET` | `/api/crossings/{id}` | переход целиком |
| `PATCH` | `/api/crossings/{id}` | изменить число полос, ширину, состояние светофоров |
| `DELETE` | `/api/crossings/{id}` | удалить переход |
| `POST` | `/api/crossings/{id}/camera-poles` | добавить столб с камерой |
| `PATCH` | `/api/camera-poles/{id}` | изменить сторону, высоту, поворот камеры |
| `DELETE` | `/api/camera-poles/{id}` | удалить столб с камерой |
