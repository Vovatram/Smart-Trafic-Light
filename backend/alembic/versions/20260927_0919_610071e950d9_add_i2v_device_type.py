"""add i2v device type

Revision ID: 610071e950d9
Revises: 668015d4bfee
Create Date: 2026-09-27 09:19:53.655583

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '610071e950d9'
down_revision: Union[str, Sequence[str], None] = '668015d4bfee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TYPE its_device_type ADD VALUE 'i2v'")


def downgrade() -> None:
    """Downgrade schema."""
    # Postgres не умеет удалять значение enum (нет DROP VALUE) — честный откат
    # потребовал бы пересоздать тип и все зависимые колонки; для этого
    # демо-проекта не делаем, оставляем как есть.
    pass
