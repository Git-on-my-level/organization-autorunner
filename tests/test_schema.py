from pathlib import Path
import tempfile
import unittest

from oar_core.schema import load_contract_schema, read_schema_version


class ReadSchemaVersionTests(unittest.TestCase):
    def test_reads_version_from_contract(self) -> None:
        contract_path = Path(__file__).resolve().parents[1] / "contracts" / "oar-schema.yaml"
        self.assertEqual(read_schema_version(contract_path), "0.2.2")

    def test_raises_for_missing_version(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            schema_path = Path(tmp_dir) / "schema.yaml"
            schema_path.write_text("name: test\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                read_schema_version(schema_path)


class SchemaLoaderTests(unittest.TestCase):
    def test_exposes_enum_policies_ref_prefixes_and_packets(self) -> None:
        contract_path = Path(__file__).resolve().parents[1] / "contracts" / "oar-schema.yaml"
        schema = load_contract_schema(contract_path)

        self.assertEqual(schema.version, "0.2.2")
        self.assertEqual(schema.enum_policy("thread_status"), "strict")
        self.assertEqual(schema.enum_policy("event_type"), "open")
        self.assertIn("artifact", schema.typed_ref_prefixes)
        self.assertIn("url", schema.typed_ref_prefixes)

        self.assertIn("sources", schema.provenance_fields)
        self.assertTrue(schema.provenance_fields["sources"].required)

        receipt_packet = schema.packets["receipt"]
        self.assertIn("outputs", receipt_packet.fields)
        self.assertEqual(receipt_packet.fields["outputs"].min_items, 1)
        self.assertEqual(
            receipt_packet.fields["verification_evidence"].min_items,
            1,
        )


if __name__ == "__main__":
    unittest.main()
