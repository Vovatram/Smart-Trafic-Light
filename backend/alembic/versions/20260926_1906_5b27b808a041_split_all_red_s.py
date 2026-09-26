"""split_all_red_s

Revision ID: 5b27b808a041
Revises: ab5d945483cf
Create Date: 2026-09-26 19:06:40.613978

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b27b808a041'
down_revision: Union[str, Sequence[str], None] = 'ab5d945483cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # добавляем nullable, переносим значение из старого all_red_s (а не
    # константу), затем закрываем NOT NULL — так уже настроенное значение
    # не потеряется при разбиении поля на два
    op.add_column('crossings', sa.Column('all_red_after_cars_s', sa.Float(), nullable=True))
    op.add_column('crossings', sa.Column('all_red_after_peds_s', sa.Float(), nullable=True))
    op.execute(
        "UPDATE crossings SET all_red_after_cars_s = all_red_s, all_red_after_peds_s = all_red_s"
    )
    op.alter_column('crossings', 'all_red_after_cars_s', nullable=False)
    op.alter_column('crossings', 'all_red_after_peds_s', nullable=False)
    op.drop_column('crossings', 'all_red_s')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        'crossings',
        sa.Column('all_red_s', sa.DOUBLE_PRECISION(precision=53), autoincrement=False, nullable=True),
    )
    op.execute("UPDATE crossings SET all_red_s = all_red_after_cars_s")
    op.alter_column('crossings', 'all_red_s', nullable=False)
    op.drop_column('crossings', 'all_red_after_peds_s')
    op.drop_column('crossings', 'all_red_after_cars_s')
