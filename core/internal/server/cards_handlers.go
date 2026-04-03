package server

import (
	"errors"
	"net/http"

	"organization-autorunner-core/internal/primitives"
)

func handleListCards(w http.ResponseWriter, r *http.Request, opts handlerOptions) {
	if opts.primitiveStore == nil {
		writeError(w, http.StatusServiceUnavailable, "primitives_unavailable", "primitives store is not configured")
		return
	}

	cards, err := opts.primitiveStore.ListCards(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to list cards")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"cards": cards})
}

func handleGetCard(w http.ResponseWriter, r *http.Request, opts handlerOptions, cardID string) {
	handleGetBoardCard(w, r, opts, "", cardID)
}

func handlePatchCard(w http.ResponseWriter, r *http.Request, opts handlerOptions, cardID string) {
	if opts.primitiveStore == nil {
		writeError(w, http.StatusServiceUnavailable, "primitives_unavailable", "primitives store is not configured")
		return
	}

	var req struct {
		ActorID     string         `json:"actor_id"`
		IfUpdatedAt *string        `json:"if_updated_at"`
		Patch       map[string]any `json:"patch"`
	}
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if req.Patch == nil || len(req.Patch) == 0 {
		writeError(w, http.StatusBadRequest, "invalid_request", "patch is required")
		return
	}
	if req.IfUpdatedAt == nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "if_updated_at is required")
		return
	}
	ifUpdatedAt, ok := normalizeRequiredTimestamp(w, req.IfUpdatedAt, "if_updated_at")
	if !ok {
		return
	}

	actorID, ok := resolveWriteActorID(w, r, opts, req.ActorID)
	if !ok {
		return
	}

	patchInput, changedFields, ok := parseBoardCardPatchInput(w, req.Patch)
	if !ok {
		return
	}
	patchInput.IfBoardUpdatedAt = &ifUpdatedAt

	beforeCard, err := loadBoardCardForEvent(r.Context(), opts, "", cardID)
	if err != nil {
		if errors.Is(err, primitives.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "card not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load card")
		return
	}

	result, err := opts.primitiveStore.UpdateBoardCard(r.Context(), actorID, "", cardID, patchInput)
	if err != nil {
		switch {
		case errors.Is(err, primitives.ErrInvalidBoardRequest):
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		case errors.Is(err, primitives.ErrNotFound):
			writeError(w, http.StatusNotFound, "not_found", "card not found")
		case errors.Is(err, primitives.ErrConflict):
			writeError(w, http.StatusConflict, "conflict", "card has been updated; refresh and retry")
		default:
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to patch card")
		}
		return
	}

	if anyString(result.Card["updated_at"]) != anyString(beforeCard["updated_at"]) || anyString(result.Card["version"]) != anyString(beforeCard["version"]) {
		emitCardLifecycleEventBestEffort(r.Context(), opts, actorID, buildCardUpdatedEvent(result.Board, beforeCard, result.Card, changedFields))
		emitBoardLifecycleEventBestEffort(r.Context(), opts, actorID, buildBoardCardUpdatedEvent(result.Board, beforeCard, result.Card, changedFields))
	}

	writeJSON(w, http.StatusOK, map[string]any{"card": result.Card})
}

func handleArchiveCard(w http.ResponseWriter, r *http.Request, opts handlerOptions, cardID string) {
	handleArchiveBoardCard(w, r, opts, "", cardID)
}
