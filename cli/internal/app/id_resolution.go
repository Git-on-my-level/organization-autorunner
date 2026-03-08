package app

import (
	"context"
	"strings"

	"organization-autorunner-cli/internal/config"
)

var typedRefLookupByPrefix = map[string]resourceIDLookupSpec{
	"thread":     threadIDLookupSpec,
	"artifact":   artifactIDLookupSpec,
	"commitment": commitmentIDLookupSpec,
}

var typedRefListFields = map[string]struct{}{
	"context_refs":  {},
	"evidence_refs": {},
	"key_artifacts": {},
	"links":         {},
	"refs":          {},
}

func (a *App) resolveThreadIDFilters(ctx context.Context, cfg config.Resolved, rawIDs []string) ([]string, error) {
	if len(rawIDs) == 0 {
		return nil, nil
	}
	resolved := make([]string, 0, len(rawIDs))
	for _, rawID := range normalizeIDFilters(rawIDs) {
		resolvedID := rawID
		if shouldResolveDisplayedShortID(rawID) {
			var err error
			resolvedID, err = a.resolveResourceIDFromList(ctx, cfg, rawID, threadIDLookupSpec)
			if err != nil {
				return nil, err
			}
		}
		resolved = append(resolved, resolvedID)
	}
	return normalizeIDFilters(resolved), nil
}

func (a *App) normalizeMutationBodyIDs(ctx context.Context, cfg config.Resolved, commandID string, body any) (any, error) {
	if body == nil || !commandSupportsMutationIDResolution(commandID) {
		return body, nil
	}
	return a.normalizeMutationValue(ctx, cfg, "", deepCloneJSONValue(body))
}

func commandSupportsMutationIDResolution(commandID string) bool {
	switch strings.TrimSpace(commandID) {
	case "commitments.create",
		"commitments.patch",
		"docs.create",
		"docs.update",
		"events.create",
		"inbox.ack",
		"packets.receipts.create",
		"packets.reviews.create",
		"packets.work-orders.create",
		"threads.create",
		"threads.patch":
		return true
	default:
		return false
	}
}

func (a *App) normalizeMutationValue(ctx context.Context, cfg config.Resolved, parentKey string, value any) (any, error) {
	switch typed := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, nested := range typed {
			normalized, err := a.normalizeMutationFieldValue(ctx, cfg, key, nested)
			if err != nil {
				return nil, err
			}
			out[key] = normalized
		}
		return out, nil
	case []any:
		out := make([]any, 0, len(typed))
		for _, nested := range typed {
			normalized, err := a.normalizeMutationValue(ctx, cfg, parentKey, nested)
			if err != nil {
				return nil, err
			}
			out = append(out, normalized)
		}
		return out, nil
	default:
		return value, nil
	}
}

func (a *App) normalizeMutationFieldValue(ctx context.Context, cfg config.Resolved, key string, value any) (any, error) {
	switch strings.TrimSpace(key) {
	case "thread_id":
		raw := strings.TrimSpace(anyString(value))
		if raw == "" || !shouldResolveDisplayedShortID(raw) {
			return value, nil
		}
		return a.resolveResourceIDFromList(ctx, cfg, raw, threadIDLookupSpec)
	default:
		if _, ok := typedRefListFields[key]; ok {
			return a.normalizeTypedRefList(ctx, cfg, value)
		}
		return a.normalizeMutationValue(ctx, cfg, key, value)
	}
}

func (a *App) normalizeTypedRefList(ctx context.Context, cfg config.Resolved, value any) (any, error) {
	refs, ok := asStringList(value)
	if !ok {
		return value, nil
	}
	out := make([]any, 0, len(refs))
	for _, ref := range refs {
		normalized, err := a.normalizeTypedRef(ctx, cfg, ref)
		if err != nil {
			return nil, err
		}
		out = append(out, normalized)
	}
	return out, nil
}

func (a *App) normalizeTypedRef(ctx context.Context, cfg config.Resolved, raw string) (string, error) {
	kind, value, canonical, err := parseTypedRef(raw)
	if err != nil {
		return raw, nil
	}
	spec, ok := typedRefLookupByPrefix[kind]
	if !ok {
		return canonical, nil
	}
	if !shouldResolveDisplayedShortID(value) {
		return canonical, nil
	}
	resolvedID, err := a.resolveResourceIDFromList(ctx, cfg, value, spec)
	if err != nil {
		return "", err
	}
	return kind + ":" + resolvedID, nil
}

func shouldResolveDisplayedShortID(raw string) bool {
	return len(strings.TrimSpace(raw)) == shortIDLength
}

func deepCloneJSONValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, nested := range typed {
			out[key] = deepCloneJSONValue(nested)
		}
		return out
	case []any:
		out := make([]any, 0, len(typed))
		for _, nested := range typed {
			out = append(out, deepCloneJSONValue(nested))
		}
		return out
	default:
		return value
	}
}
