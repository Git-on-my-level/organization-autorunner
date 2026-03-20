package authaudit

import (
	"testing"
	"time"
)

func TestFormatOccurredAtSortKeyUsesFixedWidthFractions(t *testing.T) {
	t.Parallel()

	withFraction := FormatOccurredAtSortKey(time.Date(2026, 3, 20, 10, 0, 0, 100_000_000, time.UTC))
	wholeSecond := FormatOccurredAtSortKey(time.Date(2026, 3, 20, 10, 0, 0, 0, time.UTC))

	if withFraction <= wholeSecond {
		t.Fatalf("expected fractional timestamp sort key %q to order after whole-second key %q", withFraction, wholeSecond)
	}
	if wholeSecond != "2026-03-20T10:00:00.000000000Z" {
		t.Fatalf("expected fixed-width zero fraction, got %q", wholeSecond)
	}
}

func TestParseOccurredAtRoundTripsRFC3339Nano(t *testing.T) {
	t.Parallel()

	raw := "2026-03-20T10:00:00.123456789Z"
	parsed, err := ParseOccurredAt(raw)
	if err != nil {
		t.Fatalf("parse occurred_at: %v", err)
	}
	if parsed.Format(time.RFC3339Nano) != raw {
		t.Fatalf("expected %q, got %q", raw, parsed.Format(time.RFC3339Nano))
	}
}
