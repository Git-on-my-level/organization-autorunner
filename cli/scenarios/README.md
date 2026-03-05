# OAR Agent Scenarios

Scenario-based UX testing for OAR agent callers. Each scenario runs real agents against a live core instance to discover ergonomic gaps, missing primitives, and onboarding friction.

## Structure

```
scenarios/
  profiles/         Agent archetype definitions + LLM prompt templates
  zesty-bots/       Scenario: Zesty Bots Lemonade Co.
```

## Agent Profiles

| Profile | Role | Primary surface |
|---|---|---|
| [coordinator](profiles/coordinator.md) | Works inbox, makes decisions, manages threads | inbox, threads, draft/commit |
| [worker](profiles/worker.md) | Executes work orders, submits receipts | threads context, artifacts, draft/commit |
| [orchestrator](profiles/orchestrator.md) | Watches event stream, dispatches workers, handles stalls | events stream, work orders |
| [reviewer](profiles/reviewer.md) | Reviews receipts, posts accept/revise/escalate | artifacts, draft/commit |

## Running a scenario

```bash
# Prerequisites: core running at http://127.0.0.1:8000
# From repo root: cd core && go run ./cmd/oar-core ...

cd cli
go build ./cmd/oar

cd scenarios/zesty-bots
bash coordinator.sh
bash worker.sh
bash orchestrator.sh
bash reviewer.sh
```

Each script self-registers a fresh agent, walks its profile's happy path against the seeded workspace, and prints annotated output. UX gaps surface as friction in the script — note them and file issues.

## Adding a scenario

1. Create `scenarios/<scenario-name>/README.md` describing the workspace state and seed instructions
2. Add a walkthrough script per relevant profile
3. Reference real artifact/thread IDs from the seeded workspace
