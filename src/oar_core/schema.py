"""Utilities for loading shared schema metadata from contracts/oar-schema.yaml."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

DEFAULT_SCHEMA_PATH = Path(__file__).resolve().parents[2] / "contracts" / "oar-schema.yaml"
_VERSION_PATTERN = re.compile(r'^\s*version\s*:\s*["\']?([^"\']+)["\']?\s*$')
_SECTION_HEADER_PATTERN = re.compile(r"^([a-zA-Z0-9_]+):\s*$")


@dataclass(frozen=True)
class EnumSpec:
    policy: str
    values: tuple[str, ...]


@dataclass(frozen=True)
class ProvenanceFieldSpec:
    type_name: str
    required: bool


@dataclass(frozen=True)
class PacketFieldSpec:
    type_name: str
    required: bool
    min_items: int | None
    enum_ref: str | None


@dataclass(frozen=True)
class PacketSchema:
    name: str
    fields: dict[str, PacketFieldSpec]


@dataclass(frozen=True)
class ContractSchema:
    version: str
    enums: dict[str, EnumSpec]
    typed_ref_prefixes: tuple[str, ...]
    provenance_fields: dict[str, ProvenanceFieldSpec]
    packets: dict[str, PacketSchema]

    def enum_policy(self, enum_name: str) -> str:
        return self.enums[enum_name].policy


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def _find_top_level_header(lines: list[str], section_name: str) -> int:
    target = f"{section_name}:"
    for idx, line in enumerate(lines):
        if line.strip() == target and _indent(line) == 0:
            return idx
    raise ValueError(f"Section '{section_name}' not found in schema")


def _extract_top_level_section(lines: list[str], section_name: str) -> list[str]:
    start_idx = _find_top_level_header(lines, section_name)
    section_lines: list[str] = []
    for line in lines[start_idx + 1 :]:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and _indent(line) == 0:
            # Hit next top-level block.
            break
        section_lines.append(line)
    return section_lines


def _strip_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _parse_inline_list(raw: str) -> list[str]:
    inner = raw.strip()
    if not inner:
        return []
    parts = [part.strip() for part in inner.split(",")]
    return [_strip_quotes(part) for part in parts if part]


def _parse_enums(lines: list[str]) -> dict[str, EnumSpec]:
    result: dict[str, dict[str, object]] = {}
    current_name: str | None = None
    collecting_values = False

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        enum_match = re.match(r"^\s{2}([a-zA-Z0-9_]+):\s*$", line)
        if enum_match:
            current_name = enum_match.group(1)
            result[current_name] = {"policy": None, "values": []}
            collecting_values = False
            continue

        if current_name is None:
            continue

        policy_match = re.match(r"^\s{4}enum_policy:\s*(strict|open)\s*$", line)
        if policy_match:
            result[current_name]["policy"] = policy_match.group(1)
            collecting_values = False
            continue

        inline_values_match = re.match(r"^\s{4}values:\s*\[(.*)\]\s*$", line)
        if inline_values_match:
            values = _parse_inline_list(inline_values_match.group(1))
            result[current_name]["values"] = values
            collecting_values = False
            continue

        if re.match(r"^\s{4}values:\s*$", line):
            collecting_values = True
            result[current_name]["values"] = []
            continue

        if collecting_values:
            list_item_match = re.match(r"^\s{6}-\s*(.+?)\s*$", line)
            if list_item_match:
                cast_values = result[current_name]["values"]
                assert isinstance(cast_values, list)
                cast_values.append(_strip_quotes(list_item_match.group(1)))
                continue

            if _indent(line) <= 4 and stripped:
                collecting_values = False

    enums: dict[str, EnumSpec] = {}
    for enum_name, raw_spec in result.items():
        policy = raw_spec["policy"]
        values = raw_spec["values"]
        if policy not in {"strict", "open"}:
            raise ValueError(f"Enum '{enum_name}' missing enum_policy in schema")
        if not isinstance(values, list):
            raise ValueError(f"Enum '{enum_name}' has invalid values in schema")
        enums[enum_name] = EnumSpec(policy=policy, values=tuple(values))

    return enums


def _parse_ref_prefixes(lines: list[str]) -> tuple[str, ...]:
    in_prefixes = False
    prefixes: list[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        if stripped == "prefixes:" and _indent(line) == 2:
            in_prefixes = True
            continue

        if in_prefixes and _indent(line) <= 2:
            # End of prefix block.
            break

        if not in_prefixes:
            continue

        prefix_match = re.match(r'^\s{4}"?([^"]+?)"?\s*:\s*', line)
        if prefix_match:
            key = prefix_match.group(1)
            prefix = key.split(":", 1)[0]
            if prefix:
                prefixes.append(prefix)

    return tuple(prefixes)


def _parse_provenance_fields(lines: list[str]) -> dict[str, ProvenanceFieldSpec]:
    in_fields = False
    current_name: str | None = None
    raw_fields: dict[str, dict[str, object]] = {}

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        if stripped == "fields:" and _indent(line) == 2:
            in_fields = True
            continue

        if in_fields and _indent(line) <= 2:
            break

        if not in_fields:
            continue

        field_match = re.match(r"^\s{4}([a-zA-Z0-9_]+):\s*$", line)
        if field_match:
            current_name = field_match.group(1)
            raw_fields[current_name] = {"type_name": "", "required": False}
            continue

        if current_name is None:
            continue

        type_match = re.match(r"^\s{6}type:\s*(.+?)\s*$", line)
        if type_match:
            raw_fields[current_name]["type_name"] = _strip_quotes(type_match.group(1))
            continue

        required_match = re.match(r"^\s{6}required:\s*(true|false)\s*$", line)
        if required_match:
            raw_fields[current_name]["required"] = required_match.group(1) == "true"
            continue

    fields: dict[str, ProvenanceFieldSpec] = {}
    for field_name, raw_spec in raw_fields.items():
        type_name = raw_spec["type_name"]
        required = raw_spec["required"]
        if not isinstance(type_name, str) or not type_name:
            raise ValueError(f"Provenance field '{field_name}' missing type in schema")
        if not isinstance(required, bool):
            raise ValueError(f"Provenance field '{field_name}' missing required flag in schema")
        fields[field_name] = ProvenanceFieldSpec(type_name=type_name, required=required)

    return fields


def _parse_packet_fields(lines: list[str]) -> dict[str, PacketSchema]:
    packets: dict[str, dict[str, PacketFieldSpec]] = {}
    current_packet: str | None = None
    in_fields = False

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        packet_match = re.match(r"^\s{2}(work_order|receipt|review):\s*$", line)
        if packet_match:
            current_packet = packet_match.group(1)
            packets[current_packet] = {}
            in_fields = False
            continue

        if current_packet is None:
            continue

        if re.match(r"^\s{4}fields:\s*$", line):
            in_fields = True
            continue

        if in_fields and _indent(line) <= 4:
            in_fields = False

        if not in_fields:
            continue

        field_match = re.match(r"^\s{6}([a-zA-Z0-9_]+)\s*:\s*\{(.*)\}\s*$", line)
        if not field_match:
            continue

        field_name = field_match.group(1)
        field_def = field_match.group(2)

        required_match = re.search(r"\brequired:\s*(true|false)\b", field_def)
        type_match = re.search(r"\btype:\s*(\"[^\"]*\"|'[^']*'|[^,\s}]+)", field_def)
        min_items_match = re.search(r"\bmin_items:\s*(\d+)\b", field_def)
        ref_match = re.search(r"\bref:\s*(\"[^\"]*\"|'[^']*'|[^,\s}]+)", field_def)

        packets[current_packet][field_name] = PacketFieldSpec(
            type_name=_strip_quotes(type_match.group(1)) if type_match else "",
            required=(required_match.group(1) == "true") if required_match else False,
            min_items=int(min_items_match.group(1)) if min_items_match else None,
            enum_ref=_strip_quotes(ref_match.group(1)) if ref_match else None,
        )

    return {
        packet_name: PacketSchema(name=packet_name, fields=field_specs)
        for packet_name, field_specs in packets.items()
    }


def load_contract_schema(schema_path: Path = DEFAULT_SCHEMA_PATH) -> ContractSchema:
    """Load schema metadata needed by validation and API behavior."""
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema file not found: {schema_path}")

    lines = schema_path.read_text(encoding="utf-8").splitlines()

    version: str | None = None
    for line in lines:
        match = _VERSION_PATTERN.match(line)
        if match:
            version = match.group(1).strip()
            break
    if version is None:
        raise ValueError(f"No top-level version key found in schema file: {schema_path}")

    enums = _parse_enums(_extract_top_level_section(lines, "enums"))
    ref_prefixes = _parse_ref_prefixes(_extract_top_level_section(lines, "ref_format"))
    provenance_fields = _parse_provenance_fields(_extract_top_level_section(lines, "provenance"))
    packets = _parse_packet_fields(_extract_top_level_section(lines, "packets"))

    return ContractSchema(
        version=version,
        enums=enums,
        typed_ref_prefixes=ref_prefixes,
        provenance_fields=provenance_fields,
        packets=packets,
    )


def read_schema_version(schema_path: Path = DEFAULT_SCHEMA_PATH) -> str:
    """Backward-compatible helper for callers that only need schema.version."""
    return load_contract_schema(schema_path).version
