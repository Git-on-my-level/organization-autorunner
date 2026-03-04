import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from oar_core.schema import load_contract_schema
from oar_core.storage import WorkspaceStorage
from oar_core.validation import (
    ValidationError,
    validate_event_write,
    validate_packet,
    validate_refs,
    validate_thread_write_patch,
)


class ValidationEdgeCaseTests(unittest.TestCase):
    def setUp(self) -> None:
        contract_path = Path(__file__).resolve().parents[1] / "contracts" / "oar-schema.yaml"
        self.schema = load_contract_schema(contract_path)
        self._tmp_dir = tempfile.TemporaryDirectory()
        self.storage = WorkspaceStorage(Path(self._tmp_dir.name) / "workspace")
        self.storage.initialize()

    def tearDown(self) -> None:
        self._tmp_dir.cleanup()

    def test_strict_enum_invalid_value_is_rejected(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            validate_thread_write_patch(self.schema, {"status": "not_a_real_status"})
        self.assertIn("thread_status", str(ctx.exception))

    def test_open_enum_unknown_event_type_is_accepted_and_stored(self) -> None:
        event = {
            "id": "evt_open_enum",
            "ts": "2026-03-04T00:00:00Z",
            "type": "event_type_not_yet_known",
            "actor_id": "actor_1",
            "thread_id": None,
            "refs": ["artifact:a1"],
            "summary": "unknown open enum value should pass",
            "payload": {"k": "v"},
            "provenance": {"sources": ["inferred"]},
        }
        self.storage.insert_event(self.schema, event)

        with sqlite3.connect(self.storage.paths.db_path) as conn:
            row = conn.execute(
                "SELECT type, refs_json FROM events WHERE id = ?",
                ("evt_open_enum",),
            ).fetchone()
            self.assertIsNotNone(row)
            assert row is not None
            self.assertEqual(row[0], "event_type_not_yet_known")
            self.assertEqual(json.loads(row[1]), ["artifact:a1"])

    def test_refs_without_colon_are_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            validate_refs(["missing_colon"])

    def test_unknown_ref_prefix_with_valid_shape_is_accepted_and_stored(self) -> None:
        event = {
            "id": "evt_unknown_ref_prefix",
            "ts": "2026-03-04T00:00:00Z",
            "type": "message_posted",
            "actor_id": "actor_1",
            "thread_id": None,
            "refs": ["alien:object-123"],
            "summary": "unknown prefix should be preserved",
            "payload": {"ok": True},
            "provenance": {"sources": ["inferred"]},
        }
        self.storage.insert_event(self.schema, event)

        with sqlite3.connect(self.storage.paths.db_path) as conn:
            row = conn.execute(
                "SELECT refs_json FROM events WHERE id = ?",
                ("evt_unknown_ref_prefix",),
            ).fetchone()
            self.assertIsNotNone(row)
            assert row is not None
            self.assertEqual(json.loads(row[0]), ["alien:object-123"])

    def test_missing_provenance_sources_is_rejected(self) -> None:
        event = {
            "id": "evt_bad_provenance",
            "ts": "2026-03-04T00:00:00Z",
            "type": "message_posted",
            "actor_id": "actor_1",
            "thread_id": None,
            "refs": ["artifact:a1"],
            "summary": "missing sources",
            "payload": {},
            "provenance": {},
        }
        with self.assertRaises(ValidationError) as ctx:
            validate_event_write(self.schema, event)
        self.assertIn("provenance.sources", str(ctx.exception))

    def test_packet_min_items_enforced(self) -> None:
        receipt_packet = {
            "receipt_id": "art_1",
            "work_order_id": "art_wo",
            "thread_id": "thread_1",
            "outputs": [],
            "verification_evidence": ["artifact:test-log"],
            "changes_summary": "summary",
            "known_gaps": [],
        }
        with self.assertRaises(ValidationError) as ctx:
            validate_packet(self.schema, "receipt", receipt_packet)
        self.assertIn("at least 1 items", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
