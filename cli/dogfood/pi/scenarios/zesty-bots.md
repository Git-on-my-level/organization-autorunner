# Zesty Bots Pi Dogfood

You are dogfooding the OAR CLI against a live seeded Zesty Bots workspace.

Primary goal:
- complete one useful operations workflow through the real `oar` CLI

Target workflow:
- focus on the thread titled `Emergency: Lemon Supply Disruption`
- inspect the related inbox/thread context
- publish one useful `actor_statement` event with a clear operational recommendation

Required steps:
1. Register an OAR agent profile.
2. Inspect inbox and active threads.
3. Find the `Emergency: Lemon Supply Disruption` thread and related inbox items.
4. Gather enough context with `oar` to understand the situation.
5. Publish at least one useful event back to OAR with clear provenance.
6. Write `result.md` in the current directory with:
   - what you accomplished
   - exact `oar` commands you used
   - CLI friction you hit
   - concrete improvement suggestions

Constraints:
- Use only the `oar` binary for OAR interactions.
- Do not use `curl` or edit repository source files.
- Keep your notes and any helper files inside the current directory.
- If a command fails, inspect the error and recover instead of repeating it blindly.
- Prefer the exact commands in `COMMANDS.md` over trial-and-error.
- Prefer the resolved IDs and direct commands in `TARGETS.md` over rediscovery.

Live environment:
- Base URL: `http://127.0.0.1:8000`
- `oar` is available on `PATH`
- Current directory is writable

Seeded workspace facts:
- There are active threads for lemon supply disruption, summer flavor expansion, Riverside Park stand launch, daily ops, and pricing overcharge.
- Fresh inbox categories include `decision_needed`, `exception`, and `commitment_risk`.
- Useful artifacts include work orders, receipts, reviews, a summer menu draft, supplier SLA data, and pricing evidence.

Focus:
- The goal is not to hack around the CLI. The goal is to discover whether a capable agent can productively use it.
- Do not spend many turns exploring command syntax once `COMMANDS.md` gives a working form.
- Once you find the target thread, stay on that workflow until you have posted the final event and written `result.md`.
- In team mode, publish one useful non-duplicate event from your own role perspective.

Recommended opening commands:
- `oar version`
- `oar auth`
- `oar inbox list`
- `oar threads list`
- `oar artifacts list --thread-id <thread-id>`

Success condition:
- You have registered, inspected the lemon supply disruption workflow, posted one useful event, and written `result.md`.

Required end-state artifacts in the working directory:
- `event-template.json` updated with the final event body you actually send
- `result.md`
