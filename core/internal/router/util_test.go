package router

import "testing"

func TestExtractMessageTextPrefersKnownPayloadFields(t *testing.T) {
	event := map[string]any{
		"summary": "summary fallback",
		"payload": map[string]any{
			"body":    "legacy body",
			"text":    "preferred text",
			"message": "legacy message",
			"content": "legacy content",
		},
	}

	if got := extractMessageText(event); got != "preferred text" {
		t.Fatalf("expected preferred text field, got %q", got)
	}
}

func TestExtractMessageTextSupportsLegacyPayloadFields(t *testing.T) {
	cases := []struct {
		name string
		key  string
		want string
	}{
		{name: "body", key: "body", want: "@hermes from body"},
		{name: "message", key: "message", want: "@hermes from message"},
		{name: "content", key: "content", want: "@hermes from content"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			event := map[string]any{
				"summary": "summary fallback",
				"payload": map[string]any{
					tc.key: tc.want,
				},
			}
			if got := extractMessageText(event); got != tc.want {
				t.Fatalf("expected %q, got %q", tc.want, got)
			}
		})
	}
}

func TestExtractMessageTextFallsBackToSummary(t *testing.T) {
	event := map[string]any{
		"summary": "summary fallback",
		"payload": map[string]any{},
	}

	if got := extractMessageText(event); got != "summary fallback" {
		t.Fatalf("expected summary fallback, got %q", got)
	}
}
