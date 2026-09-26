"""Локальный запуск: python run.py

Отдельный entrypoint нужен, потому что политику event loop для psycopg async
на Windows нужно выставить ДО того, как uvicorn создаст свой event loop —
через `python -m uvicorn ...` app-модуль импортируется уже после этого
момента, и переключать политику будет поздно.
"""

from __future__ import annotations

import sys

if sys.platform == "win32":
    import asyncio

    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
