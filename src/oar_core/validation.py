"""Core validation helpers driven by contracts/oar-schema.yaml."""

from __future__ import annotations

from typing import Any

from .schema import ContractSchema


class ValidationError(ValueError):
    """Raised when payload validation fails."""


def validate_enum_value(schema: ContractSchema, enum_name: str, value: Any) -> None:
    if not isinstance(value, str):
        raise ValidationError(f"Enum '{enum_name}' value must be a string")

    enum_spec = schema.enums.get(enum_name)
    if enum_spec is None:
        raise ValidationError(f"Unknown enum '{enum_name}'")

    if enum_spec.policy == "strict" and value not in enum_spec.values:
        raise ValidationError(
            f"Invalid value '{value}' for strict enum '{enum_name}'"
        )


def validate_typed_ref(ref_value: Any) -> None:
    if not isinstance(ref_value, str):
        raise ValidationError("Typed ref must be a string")

    prefix, sep, value = ref_value.partition(":")
    if not sep or not prefix or not value:
        raise ValidationError("Typed ref must follow '<prefix>:<value>' format")


def validate_refs(refs: Any) -> None:
    if not isinstance(refs, list):
        raise ValidationError("refs must be a list of typed ref strings")

    for idx, ref_value in enumerate(refs):
        try:
            validate_typed_ref(ref_value)
        except ValidationError as exc:
            raise ValidationError(f"Invalid refs[{idx}]: {exc}") from exc


def validate_provenance(schema: ContractSchema, provenance: Any) -> None:
    if not isinstance(provenance, dict):
        raise ValidationError("provenance must be an object")

    for field_name, field_spec in schema.provenance_fields.items():
        if field_spec.required and field_name not in provenance:
            raise ValidationError(f"provenance.{field_name} is required")

    sources = provenance.get("sources")
    if not isinstance(sources, list) or not all(isinstance(item, str) for item in sources):
        raise ValidationError("provenance.sources must be list<string>")

    notes = provenance.get("notes")
    if notes is not None and not isinstance(notes, str):
        raise ValidationError("provenance.notes must be string when present")

    by_field = provenance.get("by_field")
    if by_field is not None:
        if not isinstance(by_field, dict):
            raise ValidationError("provenance.by_field must be map<string, list<string>>")
        for key, values in by_field.items():
            if not isinstance(key, str) or not isinstance(values, list):
                raise ValidationError("provenance.by_field must be map<string, list<string>>")
            if not all(isinstance(value, str) for value in values):
                raise ValidationError("provenance.by_field values must be list<string>")


def validate_packet(schema: ContractSchema, packet_kind: str, packet: Any) -> None:
    packet_schema = schema.packets.get(packet_kind)
    if packet_schema is None:
        raise ValidationError(f"Unknown packet kind '{packet_kind}'")
    if not isinstance(packet, dict):
        raise ValidationError("packet payload must be an object")

    for field_name, field_spec in packet_schema.fields.items():
        if field_spec.required and field_name not in packet:
            raise ValidationError(
                f"{packet_kind}.{field_name} is required by packet schema"
            )

        if field_name not in packet:
            continue

        value = packet[field_name]

        if field_spec.type_name.startswith("list<"):
            if not isinstance(value, list):
                raise ValidationError(f"{packet_kind}.{field_name} must be a list")
            if field_spec.min_items is not None and len(value) < field_spec.min_items:
                raise ValidationError(
                    f"{packet_kind}.{field_name} must have at least {field_spec.min_items} items"
                )
            if field_spec.type_name == "list<typed_ref>":
                validate_refs(value)
        elif field_spec.type_name == "string":
            if not isinstance(value, str):
                raise ValidationError(f"{packet_kind}.{field_name} must be a string")

        if field_spec.enum_ref and field_spec.enum_ref.startswith("enums."):
            enum_name = field_spec.enum_ref.split(".", 1)[1]
            validate_enum_value(schema, enum_name, value)


def validate_event_write(schema: ContractSchema, event: Any) -> None:
    if not isinstance(event, dict):
        raise ValidationError("event must be an object")
    for field_name in ("id", "ts", "type", "actor_id", "refs", "summary", "provenance"):
        if field_name not in event:
            raise ValidationError(f"event.{field_name} is required")
    validate_enum_value(schema, "event_type", event["type"])
    validate_refs(event["refs"])
    validate_provenance(schema, event["provenance"])


def validate_artifact_write(schema: ContractSchema, artifact: Any) -> None:
    if not isinstance(artifact, dict):
        raise ValidationError("artifact must be an object")
    for field_name in ("id", "created_at", "created_by", "kind", "content_type", "content_path", "refs"):
        if field_name not in artifact:
            raise ValidationError(f"artifact.{field_name} is required")
    validate_enum_value(schema, "artifact_kind", artifact["kind"])
    validate_refs(artifact["refs"])


def validate_thread_write_patch(schema: ContractSchema, patch: Any) -> None:
    if not isinstance(patch, dict):
        raise ValidationError("thread patch must be an object")

    if "status" in patch:
        validate_enum_value(schema, "thread_status", patch["status"])
    if "type" in patch:
        validate_enum_value(schema, "thread_type", patch["type"])
    if "priority" in patch:
        validate_enum_value(schema, "priority", patch["priority"])
    if "cadence" in patch:
        validate_enum_value(schema, "cadence", patch["cadence"])
    if "key_artifacts" in patch:
        validate_refs(patch["key_artifacts"])
    if "provenance" in patch:
        validate_provenance(schema, patch["provenance"])
