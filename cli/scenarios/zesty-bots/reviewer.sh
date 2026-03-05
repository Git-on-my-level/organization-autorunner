#!/usr/bin/env bash
# Reviewer walkthrough — Zesty Bots scenario
# Profile: reviewer.md
#
# Walks the happy path for a Reviewer agent:
#   1. Register
#   2. Read the work order
#   3. Read the receipt
#   4. Read supporting evidence
#   5. Stage and commit a review artifact (outcome: accept)
#
# Uses the completed lavender sourcing work order/receipt pair from seeded data.
# Prerequisites: core running at http://127.0.0.1:8000, oar binary at ../../oar

set -euo pipefail

OAR="${OAR_BIN:-../../oar}"
BASE_URL="${OAR_BASE_URL:-http://127.0.0.1:8000}"
AGENT="reviewer-$(date +%s)"

WORK_ORDER_ID="artifact-wo-lavender-sourcing"
RECEIPT_ID="artifact-receipt-lavender-sourcing"
THREAD_ID="a3746992-5f23-4315-8fde-2075009da066"

step() { echo; echo "── $1"; }

# ── 1. Register ────────────────────────────────────────────────────────────────
step "Registering reviewer agent: $AGENT"
"$OAR" --json --base-url "$BASE_URL" --agent "$AGENT" auth register --username "$AGENT"

ACTOR_ID=$("$OAR" --agent "$AGENT" auth whoami | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["profile"]["actor_id"])')

# ── 2. Read the work order ─────────────────────────────────────────────────────
step "Reading work order: $WORK_ORDER_ID"
WO=$("$OAR" --agent "$AGENT" api call --path "/artifacts/${WORK_ORDER_ID}/content")
echo "$WO" | python3 -c "
import sys, json
wo = json.load(sys.stdin)['data']['body']
print('Objective:', wo.get('objective'))
print('Acceptance criteria:')
for c in wo.get('acceptance_criteria', []): print(' -', c)
print('Definition of done:')
for d in wo.get('definition_of_done', []): print(' -', d)
"

# ── 3. Read the receipt ────────────────────────────────────────────────────────
step "Reading receipt: $RECEIPT_ID"
RECEIPT=$("$OAR" --agent "$AGENT" api call --path "/artifacts/${RECEIPT_ID}/content")
echo "$RECEIPT" | python3 -c "
import sys, json
r = json.load(sys.stdin)['data']['body']
print('Changes summary:', r.get('changes_summary'))
print('Outputs:', r.get('outputs'))
print('Verification evidence:', r.get('verification_evidence'))
print('Known gaps:', r.get('known_gaps'))
"

# ── 4. Read supporting evidence ────────────────────────────────────────────────
step "Reading verification evidence: artifact-summer-menu-draft"
"$OAR" --agent "$AGENT" api call --path "/artifacts/artifact-summer-menu-draft/content" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']['body']
# Content may be text — print first 300 chars
content = str(d)[:300]
print(content, '...' if len(str(d)) > 300 else '')
"

# ── 5. Submit review (atomic: artifact + review_completed event in one call) ────
step "Submitting review via packets reviews create (outcome: accept)"
REVIEW_ID="review-lavender-sourcing-$(date +%s)"
printf '{
  "artifact": {
    "refs": ["thread:%s", "artifact:%s", "artifact:%s"]
  },
  "packet": {
    "review_id": "%s",
    "work_order_id": "%s",
    "receipt_id": "%s",
    "outcome": "accept",
    "notes": "BotBotanicals pricing confirmed within margin spec (81%%). Two suppliers evaluated as required by acceptance criteria. Purchase confirmation received. Known gap (no automated reorder webhook) is acceptable for Q2 — flagged for Q3 sprint. All definition-of-done items satisfied.",
    "evidence_refs": ["artifact:artifact-summer-menu-draft", "artifact:%s"]
  }
}' "$THREAD_ID" "$WORK_ORDER_ID" "$RECEIPT_ID" "$REVIEW_ID" "$WORK_ORDER_ID" "$RECEIPT_ID" "$RECEIPT_ID" \
  | "$OAR" --agent "$AGENT" reviews create \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
b=d['data']['body']
print('Review artifact ID:', b['artifact']['id'])
print('review_completed event ID:', b['event']['id'])
print('Outcome: accept')
print('Atomic: artifact and event created in one call.')
"

step "Done. Reviewer walkthrough complete."
