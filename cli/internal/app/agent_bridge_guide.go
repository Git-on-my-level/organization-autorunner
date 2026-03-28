package app

import "strings"

func agentBridgeGuideText() string {
	const tickToken = "<<tick>>"
	guide := strings.TrimSpace(`Agent bridge

Use this when you want the preferred bridge-backed path for wake registration and live <<tick>>@handle<<tick>> delivery.

What this package is

- <<tick>>oar-agent-bridge<<tick>> is shipped in this repo as a Python package under <<tick>>adapters/agent-bridge<<tick>>.
- The package exposes the console script <<tick>>oar-agent-bridge<<tick>>.
- This repo does not document a Homebrew, npm, cargo, or standalone release-binary install path today.
- Python <<tick>>3.11+<<tick>> is required.

Install on a fresh machine

POSIX shells:

  cd adapters/agent-bridge
  python3 -m venv .venv
  source .venv/bin/activate
  python -m pip install --upgrade pip
  python -m pip install -e .

Windows PowerShell:

  cd adapters/agent-bridge
  py -3.11 -m venv .venv
  .\.venv\Scripts\Activate.ps1
  python -m pip install --upgrade pip
  python -m pip install -e .

Verify install

  oar-agent-bridge --help
  oar-agent-bridge --version
  python -m pip show oar-agent-bridge

PATH note

- The console script is installed into the active virtualenv's <<tick>>bin/<<tick>> directory on POSIX or <<tick>>Scripts\<<tick>> on Windows.
- If you see <<tick>>oar-agent-bridge: command not found<<tick>>, activate the virtualenv first or add that directory to your PATH.

Canonical example configs

- <<tick>>adapters/agent-bridge/examples/router.toml<<tick>>
- <<tick>>adapters/agent-bridge/examples/hermes.toml<<tick>>
- <<tick>>adapters/agent-bridge/examples/zeroclaw.toml<<tick>>

Required config contract

- Every config needs:
  - <<tick>>[oar] base_url<<tick>>
  - <<tick>>[oar] workspace_id<<tick>>
  - <<tick>>[oar] workspace_name<<tick>>
- Optional but common <<tick>>[oar]<<tick>> fields are:
  - <<tick>>workspace_url<<tick>>
  - <<tick>>verify_ssl<<tick>>
- <<tick>>[auth] state_path<<tick>> is optional; when omitted it defaults under <<tick>>.state/<<tick>>.
- Router runs require a <<tick>>[router]<<tick>> section.
- Bridge runs require an <<tick>>[agent]<<tick>> section with at least:
  - <<tick>>handle<<tick>>
  - <<tick>>state_dir<<tick>>
  - <<tick>>workspace_bindings<<tick>>
- Hermes ACP bridges also require:
  - <<tick>>[adapter] kind = "hermes_acp"<<tick>>
  - <<tick>>command<<tick>>
  - <<tick>>cwd_default<<tick>>
  - <<tick>>[adapter.workspace_map]<<tick>>
- ZeroClaw bridges also require:
  - <<tick>>[adapter] kind = "zeroclaw_gateway"<<tick>>
  - <<tick>>base_url<<tick>>
  - <<tick>>bearer_token<<tick>>

Minimal router config

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

Minimal Hermes bridge config

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

Workspace id source of truth

- <<tick>><workspace-id><<tick>> must be the durable router workspace id, not a slug and not a UI path segment.
- If you are bringing up a new router, the source of truth is the value you choose and set at <<tick>>[oar] workspace_id<<tick>> in the router config. Use the same value in each agent bridge config.
- If a router already exists, inspect that deployed router config and copy its <<tick>>[oar] workspace_id<<tick>> exactly.
- If your deployment is driven by control-plane workspace records, copy the durable <<tick>>workspace_id<<tick>> from that workspace record, not the slug.
- The bundled example value <<tick>>ws_main<<tick>> is only an example.
- If you still do not know the real workspace id for your deployment, stop and ask the operator. Do not guess. The current CLI does not expose a dedicated workspace-id discovery command.

Token choice

- Use <<tick>>--bootstrap-token<<tick>> when bootstrapping the very first principal in an environment.
- Use <<tick>>--invite-token<<tick>> for later principals after an invite has been created.

First-time operator path

1. Install the package and verify <<tick>>oar-agent-bridge --help<<tick>> works.
2. Copy or edit the example configs for your router and bridge.
3. Set <<tick>>[oar] base_url<<tick>>, <<tick>>workspace_id<<tick>>, and <<tick>>workspace_name<<tick>> correctly.
4. Register the router principal. Use <<tick>>--bootstrap-token<<tick>> only when bootstrapping the first principal in a fresh environment; in an existing environment use an invite instead:

  oar-agent-bridge auth register --config examples/router.toml --bootstrap-token <token>

5. Register the target bridge principal and write its registration in one step:

  oar-agent-bridge auth register --config examples/hermes.toml --invite-token <token> --apply-registration

6. Start the router and the bridge:

  oar-agent-bridge router run --config examples/router.toml
  oar-agent-bridge bridge run --config examples/hermes.toml

7. Post a test wake message containing <<tick>>@<handle><<tick>>.
8. Confirm the durable trace:
  - <<tick>>message_posted<<tick>>
  - <<tick>>agent_wakeup_requested<<tick>>
  - <<tick>>agent_wakeup_claimed<<tick>>
  - bridge reply <<tick>>message_posted<<tick>>
  - <<tick>>agent_wakeup_completed<<tick>>

Troubleshooting

- <<tick>>oar-agent-bridge: command not found<<tick>>:
  - install is missing, the virtualenv is not activated, or the script directory is not on PATH
- <<tick>>docs create conflict<<tick>> for <<tick>>agentreg.<handle><<tick>>:
  - inspect the existing document and use the update path or <<tick>>oar-agent-bridge registration apply<<tick>>
- wake request is durable but never claimed:
  - the router or bridge is offline, or <<tick>>workspace_id<<tick>> is wrong
- principal exists but wake still fails:
  - inspect <<tick>>agentreg.<handle><<tick>> for actor mismatch, disabled status, or missing workspace binding

Related docs

  oar meta doc wake-routing
  oar help docs create
  oar help docs update`)
	return strings.ReplaceAll(guide, tickToken, "`")
}
