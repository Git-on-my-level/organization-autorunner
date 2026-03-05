#!/usr/bin/env bash
# Worker walkthrough — Zesty Bots scenario
# Profile: worker.md
#
# Walks the happy path for a Worker agent executing a work order:
#   1. Register
#   2. Read the work order
#   3. Load thread context
#   4. Claim the work order
#   5. Submit a receipt artifact
#   6. Post receipt_added event
#
# Uses: artifact-wo-pricing-fix (fix Till-E POS stale cache overcharge)
# Prerequisites: core running at http://127.0.0.1:8000, oar binary at ../../oar

set -euo pipefail

OAR="${OAR_BIN:-../../oar}"
BASE_URL="${OAR_BASE_URL:-http://127.0.0.1:8000}"
AGENT="worker-$(date +%s)"

WORK_ORDER_ID="artifact-wo-pricing-fix"
THREAD_ID="d6753093-d763-4164-aa72-a331cc61c1d6"

step() { echo; echo "── $1"; }

# ── 1. Register ────────────────────────────────────────────────────────────────
step "Registering worker agent: $AGENT"
"$OAR" --json --base-url "$BASE_URL" --agent "$AGENT" auth register --username "$AGENT"

ACTOR_ID=$("$OAR" --agent "$AGENT" auth whoami | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["profile"]["actor_id"])')
echo "Actor ID: $ACTOR_ID"

# ── 2. Read the work order ─────────────────────────────────────────────────────
step "Reading work order: $WORK_ORDER_ID"
# NOTE: artifact content fetch requires 'api call' until a named command exists (issue #4)
"$OAR" --agent "$AGENT" api call --path "/artifacts/${WORK_ORDER_ID}/content" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
wo = d['data']['body']
print('Objective:', wo.get('objective'))
print('Acceptance criteria:')
for c in wo.get('acceptance_criteria', []):
    print(' -', c)
print('Definition of done:')
for d_ in wo.get('definition_of_done', []):
    print(' -', d_)
"

# ── 3. Load thread context ─────────────────────────────────────────────────────
step "Loading thread context (threads get — threads context pending issue #8)"
"$OAR" --agent "$AGENT" threads get --thread-id "$THREAD_ID" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
t = d['data']['body']['thread']
print('Thread:', t['title'])
print('Summary:', t['current_summary'])
"

# ── 4. Claim the work order ────────────────────────────────────────────────────
step "Claiming work order (work_order_claimed event — pending issue #6)"
echo "  NOTE: work_order_claimed event type not yet in schema."
echo "  Posting actor_statement as interim claim signal."

CLAIM=$(printf '{
  "event": {
    "thread_id": "%s",
    "actor_id": "%s",
    "type": "actor_statement",
    "summary": "Claiming work order %s",
    "refs": ["thread:%s", "artifact:%s"],
    "provenance": { "sources": ["actor_statement"] },
    "payload": { "claim": true, "work_order_id": "%s" }
  }
}' "$THREAD_ID" "$ACTOR_ID" "$WORK_ORDER_ID" "$THREAD_ID" "$WORK_ORDER_ID" "$WORK_ORDER_ID")

CLAIM_DRAFT=$(echo "$CLAIM" | "$OAR" --agent "$AGENT" draft create --command events.create \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['draft_id'])")
"$OAR" --agent "$AGENT" draft commit "$CLAIM_DRAFT" | python3 -c "
import sys,json; d=json.load(sys.stdin); print('Claim event ID:', d['data']['committed_data']['body']['event']['id'])"

# ── 5. Submit receipt (atomic: artifact + receipt_added event in one call) ──────
step "Submitting receipt via packets receipts create"
RECEIPT_ID="receipt-pricing-fix-$(date +%s)"
printf '{
  "artifact": {
    "refs": ["thread:%s", "artifact:%s"]
  },
  "packet": {
    "receipt_id": "%s",
    "work_order_id": "%s",
    "thread_id": "%s",
    "outputs": ["artifact:artifact-pricing-evidence"],
    "verification_evidence": ["artifact:artifact-pricing-evidence"],
    "changes_summary": "Deployed cache invalidation patch to Till-E POS. Config cache TTL reduced from 7 days to 1 hour. Post-patch validation: 10 test transactions at correct price ($3.50). All pass. Refunds issued for 3 overcharged transactions.",
    "known_gaps": []
  }
}' "$THREAD_ID" "$WORK_ORDER_ID" "$RECEIPT_ID" "$WORK_ORDER_ID" "$THREAD_ID" \
  | "$OAR" --agent "$AGENT" receipts create \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
b=d['data']['body']
print('Receipt artifact ID:', b['artifact']['id'])
print('receipt_added event ID:', b['event']['id'])
print('Atomic: artifact and event created in one call.')
"

step "Done. Worker walkthrough complete."
