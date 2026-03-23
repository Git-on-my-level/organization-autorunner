# OAR Agent Bridge

Agent-agnostic wake routing and local bridge adapters for Organization Autorunner (OAR).

This package implements four things:

1. **Registration docs** stored in OAR documents (`agentreg.<handle>`)
2. **Wake packets** stored in OAR artifacts (`kind=agent_wake`)
3. **Wake routing** from `message_posted` mentions to durable wake events
4. **Local bridge adapters** that consume wake events and invoke concrete agents

Included adapters:

- `hermes_acp` — launches `hermes acp` and speaks ACP over stdio
- `zeroclaw_gateway` — POSTs wake prompts to a running ZeroClaw Gateway `/webhook`

## Why this shape

The package uses OAR's existing canonical primitives instead of inventing a parallel state system:

- registration = OAR document
- wake packet = OAR artifact
- wake request/claim/fail/complete = OAR events

That means you can run this today against the current OAR API surface without waiting for new core endpoints.

## Install

```bash
cd adapters/agent-bridge
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Commands

Register an OAR principal and save local key state:

```bash
oar-agent-bridge auth register --config examples/hermes.toml --invite-token <token> --apply-registration
```

Read the authenticated principal:

```bash
oar-agent-bridge auth whoami --config examples/hermes.toml
```

Upsert the registration document after auth already exists:

```bash
oar-agent-bridge registration apply --config examples/hermes.toml
```

Run the mention router:

```bash
oar-agent-bridge router run --config examples/router.toml
```

Run a bridge for a concrete agent:

```bash
oar-agent-bridge bridge run --config examples/hermes.toml
oar-agent-bridge bridge run --config examples/zeroclaw.toml
```

## Config files

See:

- `examples/router.toml`
- `examples/hermes.toml`
- `examples/zeroclaw.toml`

## Minimal setup

1. Edit the example TOML files with your OAR base URL, workspace identity, and local adapter settings.
2. Register the router principal:

```bash
oar-agent-bridge auth register --config examples/router.toml --invite-token <token>
```

3. Register a concrete agent and write its registration document:

```bash
oar-agent-bridge auth register --config examples/hermes.toml --invite-token <token> --apply-registration
```

4. Start the router and one or more bridges:

```bash
oar-agent-bridge router run --config examples/router.toml
oar-agent-bridge bridge run --config examples/hermes.toml
```

Post a thread message such as `@hermes summarize the latest onboarding blockers.` The expected trace is:

- existing `message_posted`
- new `agent_wakeup_requested`
- new `agent_wakeup_claimed`
- new `message_posted` from the bridge
- new `agent_wakeup_completed`

## File layout

- `oar_agent_bridge/registry.py` - registration doc upsert
- `oar_agent_bridge/router.py` - `@handle` mention resolution and durable wake creation
- `oar_agent_bridge/bridge.py` - wake claim, adapter dispatch, reply/failure writeback
- `oar_agent_bridge/adapters/hermes_acp.py` - Hermes ACP adapter
- `oar_agent_bridge/adapters/zeroclaw_gateway.py` - ZeroClaw Gateway adapter

## Event and artifact conventions

### Registration document

Document ID:

```text
agentreg.<handle>
```

Structured content version:

```text
agent-registration/v1
```

### Wake artifact

Artifact kind:

```text
agent_wake
```

Artifact ID is deterministic from:

```text
workspace_id + thread_id + trigger_event_id + target_actor_id
```

### Wake events

- `agent_wakeup_requested`
- `agent_wakeup_claimed`
- `agent_wakeup_completed`
- `agent_wakeup_failed`

### Reply event

Bridge writeback uses normal OAR `message_posted` with refs back to the thread, trigger event, and wake artifact.

## Session identity

The cross-agent session key is:

```text
oar:<workspace_id>:<thread_id>:<handle>
```

Adapters map that stable key into their native session model.

## Tests

```bash
pip install -e .[dev]
pytest
```
