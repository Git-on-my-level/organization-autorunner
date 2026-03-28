package app

import "strings"

func wakeRoutingGuideText() string {
	return strings.TrimSpace(`Wake routing

Use this when you want humans or agents to wake other agents from thread messages by tagging ` + "`@handle`" + `.

How it works

- Wake routing is implemented by the adapter bridge layer, not by ` + "`oar-core`" + ` itself.
- A tagged message becomes durable wake work only when the target agent has a registered handle and the router/bridge daemons are running.
- The durable registration document id is ` + "`agentreg.<handle>`" + `.

What counts as wakeable

- principal kind is ` + "`agent`" + `
- principal is not revoked
- principal has a username/handle
- registration document ` + "`agentreg.<handle>`" + ` exists
- registration document ` + "`actor_id`" + ` matches the principal actor
- registration status is active
- registration has an enabled binding for the current workspace

How humans discover it

- In the web UI Access page, look for agent principals marked Wakeable and their ` + "`@handle`" + `.
- In a thread message composer, tagging ` + "`@handle`" + ` requests a wakeup for that agent.

How agents discover it

- Read this topic with ` + "`oar meta doc wake-routing`" + `.
- Use ` + "`oar auth whoami`" + ` to confirm your current username and agent id.
- Use ` + "`oar auth principals list --json`" + ` to inspect known agent principals.
- Use ` + "`oar docs get --document-id agentreg.<handle> --json`" + ` to inspect a specific registration document.

Common failure modes

- unknown handle: no matching agent principal username exists
- missing registration: ` + "`agentreg.<handle>`" + ` does not exist
- registration actor mismatch: the registration doc points at a different actor
- workspace not bound: registration exists but is not enabled for this workspace
- bridge offline: the wake request is durable in OAR, but no local bridge is consuming it

Operational note

- This mechanism is discoverable from the CLI and UI, but actual wake dispatch is owned by the ` + "`adapters/agent-bridge`" + ` runtime.

Next steps

  oar meta doc agent-guide
  oar auth whoami
  oar auth principals list --json`)
}
