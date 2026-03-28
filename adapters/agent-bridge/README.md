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

Canonical install path today:

- `oar-agent-bridge` is shipped by this repo as a local Python package.
- Python `3.11+` is required.
- This repo does not document a Homebrew, npm, cargo, or standalone release-binary install path today.

POSIX shells:

```bash
cd adapters/agent-bridge
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
```

Windows PowerShell:

```powershell
cd adapters/agent-bridge
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e .
```

Verify install:

```bash
oar-agent-bridge --help
oar-agent-bridge --version
python -m pip show oar-agent-bridge
```

The editable install writes the `oar-agent-bridge` console script into the active virtualenv's `bin/` directory on POSIX or `Scripts\` on Windows. If the shell still says `command not found`, activate the virtualenv or add that directory to your PATH.

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

Minimum config contract:

- Every config requires `[oar] base_url`, `[oar] workspace_id`, and `[oar] workspace_name`.
- Optional `[oar]` fields are `workspace_url` and `verify_ssl`.
- `[auth] state_path` is optional; if omitted it defaults under `.state/`.
- `router run` requires a `[router]` section.
- `bridge run` requires an `[agent]` section with at least `handle`, `state_dir`, and `workspace_bindings`.
- Hermes ACP bridges also require `[adapter] kind = "hermes_acp"`, `command`, `cwd_default`, and `[adapter.workspace_map]`.
- ZeroClaw bridges also require `[adapter] kind = "zeroclaw_gateway"`, `base_url`, and `bearer_token`.

Workspace id source of truth:

- `workspace_id` must be the durable router workspace id, not a slug and not a UI path segment.
- If you are bringing up a new router, the source of truth is the value you choose and set at `[oar] workspace_id` in the router config. Use the same value in each agent bridge config.
- If a router already exists, inspect that deployed router config and copy its `[oar] workspace_id` exactly.
- If the deployment is driven by control-plane workspace records, copy the durable `workspace_id` from that workspace record, not the slug.
- The example value `ws_main` in this repo is only a sample.
- If you still do not know the real deployment value, stop and ask the operator. Do not guess. The current CLI does not expose a dedicated workspace-id discovery command.

Token choice:

- Use `--bootstrap-token` when bootstrapping the first principal in an environment.
- Use `--invite-token` for later principals after an invite has been created.

Minimal router config:

```toml
[oar]
base_url = "https://oar.example"
workspace_id = "<workspace-id>"
workspace_name = "Main"

[auth]
state_path = ".state/router-auth.json"

[router]
state_path = ".state/router-state.json"

[adapter]
kind = "none"
```

Minimal Hermes bridge config:

```toml
[oar]
base_url = "https://oar.example"
workspace_id = "<workspace-id>"
workspace_name = "Main"

[auth]
state_path = ".state/hermes-auth.json"

[agent]
handle = "<handle>"
driver_kind = "acp"
adapter_kind = "hermes_acp"
state_dir = ".state/hermes"
workspace_bindings = ["<workspace-id>"]

[adapter]
kind = "hermes_acp"
command = ["hermes", "acp"]
cwd_default = "/absolute/path/to/your/hermes/workspace"

[adapter.workspace_map]
"<workspace-id>" = "/absolute/path/to/your/hermes/workspace"
```

## First-time operator path

1. Install the package and verify `oar-agent-bridge --help` works.
2. Copy or edit the example TOML files with your OAR base URL, durable workspace identity, and adapter-specific settings.
3. Register the router principal. Use `--bootstrap-token` only for the first principal in a new environment; otherwise use an invite instead:

```bash
oar-agent-bridge auth register --config examples/router.toml --bootstrap-token <token>
```

4. Register a concrete agent and write its registration document in one step:

```bash
oar-agent-bridge auth register --config examples/hermes.toml --invite-token <token> --apply-registration
```

5. Start the router and one or more bridges:

```bash
oar-agent-bridge router run --config examples/router.toml
oar-agent-bridge bridge run --config examples/hermes.toml
```

6. Post a thread message such as `@hermes summarize the latest onboarding blockers.` The expected durable trace is:

- existing `message_posted`
- new `agent_wakeup_requested`
- new `agent_wakeup_claimed`
- new `message_posted` from the bridge
- new `agent_wakeup_completed`

7. If the registration document already exists and you want a bridge-managed upsert, run:

```bash
oar-agent-bridge registration apply --config examples/hermes.toml
```

If `oar docs create` or another manual write returns `conflict` for `agentreg.<handle>`, inspect the existing document and update it instead of retrying create blindly.

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
