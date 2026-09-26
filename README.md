# SmartTrafficLight

3D-визуализация пешеходного перехода через дорогу.

- **БД** — PostgreSQL 18 (параметры перехода: число полос, ширина, состояние светофоров)
- **Бэкенд** — FastAPI + SQLAlchemy 2.0 (async, psycopg3) + Alembic
- **Фронтенд** — React 19 + Vite + Tailwind 4 (`@tailwindcss/vite`) + react-three-fiber

Дорога — прямой участок с пешеходным переходом посередине. Полосы одного
направления (N, едут «от камеры») лежат справа от осевой, полосы встречного
направления (K, едут «на камеру») — слева: правостороннее движение. N и K
независимо меняются от 0 до 5 через панель справа, разметка и столбы со
светофорами (автомобильный + пешеходный на каждом) пересчитываются сразу.

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

Дорога идёт вдоль оси **Z**, ось **X** — поперёк, **Y** — вверх; переход — зона
вокруг Z = 0. Полосы направления N (едут в сторону +Z) лежат при X > 0 (справа
от осевой), полосы направления K (едут в сторону -Z) — при X < 0. Такое
разделение соответствует правостороннему движению: у каждого направления полосы
находятся со своей стороны от центра, ближе к своей обочине.

## API

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/api/crossings` | список переходов |
| `POST` | `/api/crossings` | создать переход |
| `GET` | `/api/crossings/{id}` | переход целиком |
| `PATCH` | `/api/crossings/{id}` | изменить число полос, ширину, состояние светофоров |
| `DELETE` | `/api/crossings/{id}` | удалить переход |
