# Pi Dogfood Agents

This package is the scenario-testing lane for Pi-driven CLI dogfood.

## Provider And Model Invariant

- Keep scenario runs on the package default lane: `--provider zai --model glm-5`.
- Do not override the provider or model during scenario validation unless the user explicitly asks for a different lane.
- If you need to debug another provider or model, do it outside the scenario runner with a separate direct probe or isolated script.

Reason:
- Scenario results are only comparable across runs when they stay on the same provider/model lane.
- Cross-provider debugging can create false conclusions about scenario health.

## Operational Rule

- Treat [README.md](/Users/dazheng/car-workspace/worktrees/organization-autorunner--discord-1/cli/dogfood/pi/README.md) and [run.mjs](/Users/dazheng/car-workspace/worktrees/organization-autorunner--discord-1/cli/dogfood/pi/run.mjs) defaults as authoritative for scenario execution.
- If a provider-specific issue needs investigation, clearly label it as separate from scenario validation.
- The code default is `--max-seconds 900`. For multi-agent scenario validation, do not lower it below `600` unless you are intentionally testing timeout behavior.
