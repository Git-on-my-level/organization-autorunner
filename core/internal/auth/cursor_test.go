package auth

import "testing"

func TestAuthPrincipalCursorRoundTrip(t *testing.T) {
	t.Parallel()

	cursor := encodeAuthPrincipalCursor(7)
	offset, err := decodeAuthPrincipalCursor(cursor)
	if err != nil {
		t.Fatalf("decode principal cursor: %v", err)
	}
	if offset != 7 {
		t.Fatalf("expected offset 7, got %d", offset)
	}
}

func TestAuthAuditCursorRejectsPrincipalCursorFormat(t *testing.T) {
	t.Parallel()

	cursor := encodeAuthPrincipalCursor(2)
	decoded, err := decodeAuthAuditCursor(cursor)
	if err == nil {
		t.Fatalf("expected audit cursor decode error, got cursor %#v", decoded)
	}
}
