"""Workspace storage initialization and connectivity utilities."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .schema import ContractSchema
from .validation import (
    validate_artifact_write,
    validate_event_write,
    validate_thread_write_patch,
)

DB_FILENAME = "oar.db"


@dataclass(frozen=True)
class WorkspacePaths:
    """Resolved on-disk paths for a workspace root."""

    root: Path
    db_path: Path
    artifacts_dir: Path
    logs_dir: Path
    tmp_dir: Path


def resolve_workspace_paths(workspace_root: Path) -> WorkspacePaths:
    root = workspace_root.expanduser().resolve()
    return WorkspacePaths(
        root=root,
        db_path=root / DB_FILENAME,
        artifacts_dir=root / "artifacts",
        logs_dir=root / "logs",
        tmp_dir=root / "tmp",
    )


class WorkspaceStorage:
    """Owns filesystem + SQLite initialization for oar-core workspace state."""

    def __init__(self, workspace_root: Path):
        self.paths = resolve_workspace_paths(workspace_root)

    def initialize(self) -> None:
        """Create workspace directories and apply SQLite migrations idempotently."""
        self.paths.root.mkdir(parents=True, exist_ok=True)
        self.paths.artifacts_dir.mkdir(parents=True, exist_ok=True)
        self.paths.logs_dir.mkdir(parents=True, exist_ok=True)
        self.paths.tmp_dir.mkdir(parents=True, exist_ok=True)

        with self.connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )
            self._apply_migrations(conn)

    def connect(self) -> sqlite3.Connection:
        """Open a SQLite connection to the workspace DB."""
        return sqlite3.connect(self.paths.db_path, timeout=1.0)

    def check_connectivity(self) -> tuple[bool, str | None]:
        """Check if the storage backend is reachable."""
        try:
            with self.connect() as conn:
                conn.execute("SELECT 1")
            return True, None
        except sqlite3.Error as exc:
            return False, str(exc)

    def insert_event(self, schema: ContractSchema, event: dict[str, object]) -> None:
        """Validate and persist an event row."""
        validate_event_write(schema, event)
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO events(
                    id, ts, type, actor_id, thread_id,
                    refs_json, summary, payload_json, provenance_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event["id"],
                    event["ts"],
                    event["type"],
                    event["actor_id"],
                    event.get("thread_id"),
                    json.dumps(event["refs"]),
                    event["summary"],
                    json.dumps(event["payload"]) if "payload" in event else None,
                    json.dumps(event["provenance"]),
                ),
            )
            conn.commit()

    def insert_artifact(self, schema: ContractSchema, artifact: dict[str, object]) -> None:
        """Validate and persist artifact metadata."""
        validate_artifact_write(schema, artifact)
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO artifacts(
                    id, created_at, created_by, kind, content_type,
                    content_path, refs_json, summary
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    artifact["id"],
                    artifact["created_at"],
                    artifact["created_by"],
                    artifact["kind"],
                    artifact["content_type"],
                    artifact["content_path"],
                    json.dumps(artifact["refs"]),
                    artifact.get("summary"),
                ),
            )
            conn.commit()

    def upsert_thread_snapshot(
        self, schema: ContractSchema, thread_id: str, patch: dict[str, object], updated_at: str, updated_by: str
    ) -> None:
        """Validate strict enum fields and persist thread snapshot patch."""
        validate_thread_write_patch(schema, patch)
        provenance = patch.get("provenance", {"sources": ["inferred"]})
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO snapshots(id, type, updated_at, updated_by, data_json, provenance_json)
                VALUES (?, 'thread', ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    updated_at=excluded.updated_at,
                    updated_by=excluded.updated_by,
                    data_json=excluded.data_json,
                    provenance_json=excluded.provenance_json
                """,
                (
                    thread_id,
                    updated_at,
                    updated_by,
                    json.dumps(patch),
                    json.dumps(provenance),
                ),
            )
            conn.commit()

    def _apply_migrations(self, conn: sqlite3.Connection) -> None:
        migration_statements: dict[int, list[str]] = {
            1: [
                """
                CREATE TABLE IF NOT EXISTS events (
                    id TEXT PRIMARY KEY,
                    ts TEXT NOT NULL,
                    type TEXT NOT NULL,
                    actor_id TEXT NOT NULL,
                    thread_id TEXT,
                    refs_json TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    payload_json TEXT,
                    provenance_json TEXT NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS snapshots (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    updated_by TEXT NOT NULL,
                    data_json TEXT NOT NULL,
                    provenance_json TEXT NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS artifacts (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    content_type TEXT NOT NULL,
                    content_path TEXT NOT NULL,
                    refs_json TEXT NOT NULL,
                    summary TEXT
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS actor_registry (
                    id TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    tags_json TEXT,
                    created_at TEXT NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS derived_views (
                    id TEXT PRIMARY KEY,
                    view_type TEXT NOT NULL,
                    view_key TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    generated_at TEXT NOT NULL
                )
                """,
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_derived_views_type_key
                ON derived_views(view_type, view_key)
                """,
            ]
        }

        row = conn.execute("SELECT COALESCE(MAX(version), 0) FROM schema_migrations").fetchone()
        current_version = int(row[0]) if row else 0

        for version in sorted(migration_statements.keys()):
            if version <= current_version:
                continue

            with conn:
                for statement in migration_statements[version]:
                    conn.execute(statement)
                conn.execute(
                    "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
                    (version, datetime.now(timezone.utc).isoformat()),
                )
