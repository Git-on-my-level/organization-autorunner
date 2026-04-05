# Web UI mock / proxy / client parity plan (superseded)

This plan tracked alignment between `oarCoreClient.js`, the dev proxy, and `mockCoreData` mock routes versus the workspace contract.

**Still relevant themes:**

- Prefer **contract-driven** path allowlists and command metadata (`contracts/gen/meta/commands.json`) over hand-maintained duplicates.
- Mocks should mirror core **status codes** and **derived** semantics (for example inbox suppression from events, not destructive deletes) where tests depend on them.
- Explicitly classify handlers as **mock-supported** vs **proxy-only** so local workflows fail clearly when a path is not implemented in mocks.

**Model note:** The operator API is **topic/card/board/document**-first; backing **threads** are read-only in the workspace contract. Parity work should target those surfaces and OpenAPI response envelopes (including thread timeline/context/workspace expansions), not legacy resource types removed from the contract.

See also `web-ui/docs/http-api.md` and `web-ui/AGENTS.md`.
