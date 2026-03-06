# Scenario Harness

`oar-scenario` executes scenario manifests against a live OAR core using real CLI calls.

Goals:
- provide deterministic, CI-friendly multi-agent scenario tests
- support a built-in OpenAI-compatible LLM loop (plus pluggable external drivers)
- capture scenario run reports in machine-readable JSON
- separate in-run feedback from post-run agent reflections for later analysis

Intended use:
- deterministic mode is the repeatable automation baseline
- `llm` mode is primarily for manual simulation, product dogfood, and simulated user interviews with agent callers

The long-running `llm` scenarios are intentionally not designed as CI gates. They are for humans to run after larger changes and inspect for emergent behavior, confusion, regressions in affordances, and qualitative UX feedback.
For handoff and product review, prefer the full committed scenario manifests over local one-off probes so everyone is evaluating the same surface.
Use `bash cli/scenarios/cleanup.sh` before a fresh manual run if you want to clear prior local reports and logs from `cli/.tmp`.

This package is intentionally thin: orchestration state machine + command execution + assertion checks.

LLM actions:
- `run`: execute one CLI command turn
- `stop`: end turns for the current agent
- `feedback`: record UX/product feedback in report output without running a CLI command

When `run` fails in LLM mode, the harness also appends a structured `feedback` entry automatically (command, exit code, error excerpt) so fuzz runs preserve actionable UX friction even if the model does not explicitly emit `action=feedback`.

When `collect_final_feedback` is enabled for an agent, the harness makes one additional LLM call after the turn loop and stores the result in `report.final_feedback`. This keeps post-run reflections separate from mid-run feedback and automatic command-failure capture.

## Error Expectations

Use `expect_error` on a step when a command is expected to fail in a specific way.

```json
{
  "name": "stale update should conflict",
  "args": ["docs", "update", "--document-id", "{{coordinator.document_id}}"],
  "stdin": { "if_base_revision": "{{coordinator.initial_revision_id}}", "content": "..." },
  "expect_error": {
    "code": "conflict",
    "status": 409,
    "message_contains": "updated"
  }
}
```

Notes:
- `expect_error` and `allow_failure` are mutually exclusive.
- `expect_error` must define at least one matcher (`exit_code`, `status`, `code`, `message_contains`).

## Preflight Validation

The runner validates scenario shape before executing commands and fails fast on known schema traps.
Current preflight checks include:
- duplicate/missing agent names
- missing step args
- invalid `expect_error` usage
- `events create` with `event.type=review_completed` must include required `artifact:*` refs (unless refs are dynamic templates)
