#!/usr/bin/env bash
# Coordinator walkthrough — Zesty Bots scenario
# Profile: coordinator.md
#
# Walks the happy path for a Coordinator agent:
#   1. Register
#   2. Triage inbox
#   3. Survey active threads
#   4. Load P0 thread context
#   5. Log a decision event via draft/commit
#
# Prerequisites: core running at http://127.0.0.1:8000, oar binary at ../../oar

set -euo pipefail

OAR="${OAR_BIN:-../../oar}"
BASE_URL="${OAR_BASE_URL:-http://127.0.0.1:8000}"
AGENT="coordinator-$(date +%s)"

# Thread IDs (Zesty Bots seeded workspace)
P0_THREAD="a582c6a3-7b67-40cd-8521-d1500082f8b3"   # Emergency: Lemon Supply Disruption

step() { echo; echo "── $1"; }

# ── 1. Register ────────────────────────────────────────────────────────────────
step "Registering coordinator agent: $AGENT"
"$OAR" --json --base-url "$BASE_URL" --agent "$AGENT" auth register --username "$AGENT"

ACTOR_ID=$("$OAR" --agent "$AGENT" auth whoami | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["profile"]["actor_id"])')
echo "Actor ID: $ACTOR_ID"

# ── 2. Triage inbox ────────────────────────────────────────────────────────────
step "Checking inbox"
"$OAR" --agent "$AGENT" inbox list

# ── 3. Survey active threads ───────────────────────────────────────────────────
step "Listing active threads"
"$OAR" --agent "$AGENT" threads list --status active \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
threads = d['data']['body']['threads']
for t in threads:
    print(f\"  [{t['priority']}] {t['title']} ({t['type']}) — {t['thread_id'][:8]}...\")
"

# ── 4. Load P0 thread context ──────────────────────────────────────────────────
step "Loading P0 thread: Emergency Lemon Supply Disruption"
"$OAR" --agent "$AGENT" threads get --thread-id "$P0_THREAD" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
t = d['data']['body']['thread']
print('Summary:', t['current_summary'])
print('Next actions:')
for a in t['next_actions']:
    print(' -', a)
print('Open commitments:', t['open_commitments'])
"

# ── 5. Stage a decision event via draft ────────────────────────────────────────
step "Staging decision: approve LocalGrove Bot emergency order"
DRAFT=$(printf '{
  "event": {
    "thread_id": "%s",
    "actor_id": "%s",
    "type": "decision_made",
    "summary": "Approved emergency lemon reorder from LocalGrove Bot",
    "refs": ["thread:%s"],
    "provenance": { "sources": ["actor_statement"] },
    "payload": {
      "decision": "approved",
      "vendor": "localgrove-bot",
      "units": 100,
      "price_per_unit": 0.31,
      "rationale": "LocalGrove Bot meets lead time and price constraints. Approving to maintain operations."
    }
  }
}' "$P0_THREAD" "$ACTOR_ID" "$P0_THREAD")

DRAFT_ID=$(echo "$DRAFT" | "$OAR" --agent "$AGENT" draft create --command events.create \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['draft_id'])")
echo "Draft staged: $DRAFT_ID"

step "Inspecting draft before commit"
cat "$HOME/.config/oar/drafts/${DRAFT_ID}.json"

step "Committing decision event"
"$OAR" --agent "$AGENT" draft commit "$DRAFT_ID"

# ── 6. Ack inbox item (TODO: requires 'inbox ack' CLI command — see issue #4) ──
step "NOTE: inbox ack not yet available as a named command (issue #4)"
echo "  Would run: oar --agent $AGENT inbox ack <inbox-item-id>"

step "Done. Coordinator walkthrough complete."
