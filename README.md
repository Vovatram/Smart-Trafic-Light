# SmartTrafficLight

3D-визуализация перекрёстка со светофорным регулированием.

- **БД** — PostgreSQL 18 (геометрия перекрёстка, программы светофоров, метрики прогонов)
- **Бэкенд** — FastAPI + SQLAlchemy 2.0 (async, psycopg3) + Alembic
- **Фронтенд** — React 19 + Vite + Tailwind 4 (`@tailwindcss/vite`) + react-three-fiber

Сейчас интерфейс показывает статичный участок дороги, который можно рассматривать
с любой стороны. Расчётное ядро (микроскопическая модель потока, фазы светофора,
раздача кадров по WebSocket) уже есть на сервере и ждёт подключения к UI.

## Структура

```
backend/
  app/
    api/            REST-роуты и WebSocket
    sim/            расчётное ядро и менеджер прогонов
    geometry.py     оси полос и траектории машин
    models.py       таблицы SQLAlchemy
    seed.py         демо-перекрёсток
  alembic/          миграции
frontend/
  src/
    scene/          3D-сцена (дорога, разметка, мачты светофоров)
    components/     панели интерфейса
    hooks/          поток кадров по WebSocket
```

## Запуск

### 1. База данных

```sql
CREATE ROLE backend LOGIN PASSWORD '...';
CREATE DATABASE smart_traffic OWNER backend;
```

### 2. Бэкенд

```bash
cd backend
py -3.14 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
cp .env.example .env          # вписать пароль пользователя backend
.venv/Scripts/alembic upgrade head
.venv/Scripts/python -m app.seed
.venv/Scripts/python -m uvicorn app.main:app --reload
```

API: http://localhost:8000/api/health, документация: http://localhost:8000/docs

### 3. Фронтенд

```bash
cd frontend
npm install
npm run dev
```

Интерфейс: http://localhost:5173 (запросы `/api` проксируются на бэкенд).

## Система координат

Вид сверху: **X — на восток, Z — на север, Y — вверх**; центр перекрёстка в начале
координат. Бэкенд отдаёт координаты в метрах, фронтенд использует их без пересчёта.
Правостороннее движение: полосы въезда лежат справа от оси дороги по ходу движения,
полоса 0 — ближняя к осевой (из неё выполняется поворот налево).

## API

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/api/intersections` | список перекрёстков |
| `POST` | `/api/intersections` | создать перекрёсток с въездами |
| `GET` | `/api/intersections/{id}` | перекрёсток целиком, с программами |
| `PATCH` | `/api/intersections/{id}` | изменить параметры и въезды |
| `GET` | `/api/intersections/{id}/layout` | геометрия для отрисовки сцены |
| `POST` | `/api/intersections/{id}/programs` | добавить программу светофора |
| `PUT` | `/api/programs/{id}` | заменить программу целиком |
| `POST` | `/api/programs/{id}/activate` | сделать программу активной |
| `POST` | `/api/intersections/{id}/runs` | запустить симуляцию |
| `PATCH` | `/api/runs/{id}` | скорость модели и пауза |
| `POST` | `/api/runs/{id}/stop` | остановить прогон |
| `GET` | `/api/runs/{id}/metrics` | накопленные метрики |
| `WS` | `/api/ws/runs/{id}` | поток кадров: `layout`, затем `frame` |
