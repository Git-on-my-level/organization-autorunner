#!/usr/bin/env bash
# Orchestrator walkthrough — Zesty Bots scenario
# Profile: orchestrator.md
#
# Walks the happy path for an Orchestrator agent:
#   1. Register
#   2. Drain recent events (catch-up on startup)
#   3. Detect work_order_created events
#   4. For each: check claim status, print dispatch decision
#   5. Demonstrate bounded stream drain (safe by default)
#
# NOTE: This script demonstrates detection and dispatch logic.
# Actual worker dispatch is out-of-scope for the CLI — the orchestrator
# reads OAR and invokes workers externally.
#
# Prerequisites: core running at http://127.0.0.1:8000, oar binary at ../../oar

set -euo pipefail

OAR="${OAR_BIN:-../../oar}"
BASE_URL="${OAR_BASE_URL:-http://127.0.0.1:8000}"
AGENT="orchestrator-$(date +%s)"

step() { echo; echo "── $1"; }

# ── 1. Register ────────────────────────────────────────────────────────────────
step "Registering orchestrator agent: $AGENT"
"$OAR" --json --base-url "$BASE_URL" --agent "$AGENT" auth register --username "$AGENT"

# ── 2. Drain recent events on startup ─────────────────────────────────────────
step "Draining recent events (bounded — safe by default)"
echo "  Running: events stream --max-events 50"
echo "  (Use --follow to stay live after draining)"

# events stream emits sequential pretty-printed JSON objects; use raw_decode to parse all
"$OAR" --agent "$AGENT" events stream --max-events 50 | python3 -c "
import sys, json
decoder = json.JSONDecoder()
text = sys.stdin.read()
pos, events, work_orders = 0, [], []
while pos < len(text):
    text = text[pos:].lstrip()
    if not text:
        break
    try:
        obj, offset = decoder.raw_decode(text)
        pos = offset
        evt = obj.get('data', {}).get('data', {}).get('event', {})
        if evt:
            events.append(evt)
            if evt.get('type') == 'work_order_created':
                work_orders.append(evt)
    except json.JSONDecodeError:
        break
print(f'  Received {len(events)} events')
print(f'  work_order_created events: {len(work_orders)}')
for e in work_orders:
    # work order ID is in refs as 'artifact:<id>', not in payload
    refs = e.get('refs', [])
    wo_ref = next((r for r in refs if r.startswith('artifact:')), '(unknown)')
    wo_id = wo_ref.split(':', 1)[-1] if ':' in wo_ref else wo_ref
    print(f'    - {wo_id} on thread {e.get(\"thread_id\",\"\")[:8]}...')
"

# ── 3. Check claim status for known work orders ────────────────────────────────
step "Checking claim status for seeded work orders"
echo "  NOTE: work_order_claimed event type pending (issue #6)"
echo "  Checking for actor_statement events with claim payload as interim signal"

for WO_ID in "artifact-wo-lavender-sourcing" "artifact-wo-pricing-fix"; do
  echo
  echo "  Work order: $WO_ID"
  # In a real orchestrator, filter events by thread and look for claim signal
  # This demonstrates the query pattern — full filtering pending events.list improvements
  echo "  → Would query: events list --thread-id <thread> --type work_order_claimed"
  echo "  → If unclaimed: dispatch worker with work_order_id=$WO_ID"
  echo "  → If claimed + no receipt within timeout: redispatch (stall detected)"
done

# ── 4. Demonstrate --follow mode (exits immediately in script context) ─────────
step "Live stream mode (--follow)"
echo "  In production, run:"
echo "    oar --agent $AGENT events stream --follow"
echo "  This stays open and reconnects automatically."
echo "  Omitting --follow drains available events and exits (safe for scripts)."

step "Done. Orchestrator walkthrough complete."
