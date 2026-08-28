from __future__ import annotations

import logging
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

# P7.T2: this whole module — `fileConfig(...)` below, PLUS the actual
# migration run at the bottom of the file — is saved/restored around the
# ROOT logger's handlers/level. Two distinct reasons, both about alembic's
# logging config leaking beyond its own run:
#
# 1. `fileConfig`'s default `disable_existing_loggers=True` sets
#    `.disabled = True`, PERMANENTLY, on every logger that already exists
#    and isn't one of alembic.ini's own three (root/sqlalchemy/alembic) —
#    every `finhealth.*` logger app/main.py's configure_logging() set up
#    included. `disable_existing_loggers=False` below stops that.
# 2. Independent of that flag, `fileConfig` ALWAYS replaces the ROOT
#    logger's `.handlers` with alembic.ini's own console handler — needed
#    for a genuine `alembic upgrade head` CLI run (a fresh process with no
#    logging configured yet), but this module also runs whenever an
#    already-running process invokes alembic PROGRAMMATICALLY: `alembic
#    upgrade head` from a deploy step never reaches this code at all (a
#    fresh process exits right after), but `storage.py`'s `_bootstrap_schema`
#    (the documented "dev/fresh-db convenience" — a developer's first local
#    run, or this test suite's per-test throwaway DB) DOES, and so does
#    this test suite's own direct alembic usage in a few places
#    (tests/test_entitlements.py, tests/test_storage.py,
#    tests/test_waitlist.py). Left unguarded, any of those would silently
#    and permanently swap the app's (or pytest's) already-configured root
#    handler out from under it. Restoring only at the very end — after the
#    actual migration has run, not right after `fileConfig()` — keeps
#    alembic's own progress logging (the "Running upgrade ..." lines)
#    visible DURING the migration either way.
_root_logger = logging.getLogger()
_saved_handlers = list(_root_logger.handlers)
_saved_level = _root_logger.level

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

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


try:
    if context.is_offline_mode():
        run_migrations_offline()
    else:
        run_migrations_online()
finally:
    # See the module-level comment above `_saved_handlers`: restores
    # whatever root-logger state existed before this module ran (an
    # already-configured app's own handler, or nothing at all for a CLI
    # invocation) now that the migration itself — the part that actually
    # wants alembic's console logging visible — is done.
    _root_logger.handlers = _saved_handlers
    _root_logger.level = _saved_level
