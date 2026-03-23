from __future__ import annotations

import logging
from dataclasses import dataclass

from .auth import AuthManager
from .config import LoadedConfig
from .models import AgentRegistration, WorkspaceBinding, registration_document_id
from .oar_client import OARClient
from .util import sha256_text

LOGGER = logging.getLogger(__name__)


@dataclass(slots=True)
class RegistrationApplyResult:
    document_id: str
    actor_id: str
    handle: str
    created_or_updated: str


def apply_registration(config: LoadedConfig, auth: AuthManager, client: OARClient) -> RegistrationApplyResult:
    if config.agent is None:
        raise ValueError("registration requires an [agent] section in config")
    state = auth.require_state()
    if state.username != config.agent.handle:
        raise ValueError(
            f"auth username {state.username!r} does not match configured agent.handle {config.agent.handle!r}; tags resolve by registered name, so they must match"
        )

    registration = AgentRegistration(
        handle=config.agent.handle,
        actor_id=state.actor_id,
        driver_kind=config.agent.driver_kind,
        adapter_kind=config.agent.adapter_kind,
        resume_policy=config.agent.resume_policy,
        status=config.agent.status,
        workspace_bindings=[WorkspaceBinding(workspace_id=item) for item in config.agent.workspace_bindings],
    )
    doc_id = registration_document_id(config.agent.handle)
    payload = client.upsert_document(
        doc_id,
        document={
            "document_id": doc_id,
            "title": f"Agent registration @{config.agent.handle}",
            "status": config.agent.status,
            "labels": ["agent-registration", f"handle:{config.agent.handle}", f"actor:{state.actor_id}"],
        },
        content=registration.to_content(),
        content_type="structured",
        request_key=f"reg-{sha256_text(doc_id, state.actor_id, length=16)}",
    )
    LOGGER.info("Upserted registration document %s for @%s", doc_id, config.agent.handle)
    return RegistrationApplyResult(
        document_id=doc_id,
        actor_id=state.actor_id,
        handle=config.agent.handle,
        created_or_updated="upserted" if payload is not None else "unknown",
    )
