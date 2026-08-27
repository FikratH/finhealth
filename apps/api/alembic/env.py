from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make `app` importable regardless of the cwd alembic is invoked from (the
# normal case is `cd apps/api && alembic ...`, but be defensive).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.storage import database_url, metadata  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = metadata


def _resolve_url() -> str:
    # An explicit sqlalchemy.url (set programmatically by storage.py's
    # bootstrap path, or via -x on the CLI) wins; otherwise resolve the URL
    # exactly the way the running app does.
    configured = config.get_main_option("sqlalchemy.url")
    if configured:
        return configured
    return database_url()


def run_migrations_offline() -> None:
    context.configure(
        url=_resolve_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = _resolve_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
