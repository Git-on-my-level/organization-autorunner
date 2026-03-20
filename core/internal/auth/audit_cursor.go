package auth

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
)

type authAuditCursor struct {
	SortKey string `json:"sort_key"`
	EventID string `json:"event_id"`
}

func encodeAuthAuditCursor(sortKey string, eventID string) string {
	cursor := authAuditCursor{
		SortKey: strings.TrimSpace(sortKey),
		EventID: strings.TrimSpace(eventID),
	}
	if cursor.SortKey == "" || cursor.EventID == "" {
		return ""
	}
	encoded, err := json.Marshal(cursor)
	if err != nil {
		return ""
	}
	return base64.StdEncoding.EncodeToString(encoded)
}

func decodeAuthAuditCursor(cursor string) (*authAuditCursor, error) {
	if cursor == "" {
		return nil, nil
	}

	decoded, err := base64.StdEncoding.DecodeString(cursor)
	if err != nil {
		return nil, fmt.Errorf("invalid cursor encoding: %w", err)
	}

	var decodedCursor authAuditCursor
	if err := json.Unmarshal(decoded, &decodedCursor); err != nil {
		return nil, fmt.Errorf("invalid cursor format")
	}

	decodedCursor.SortKey = strings.TrimSpace(decodedCursor.SortKey)
	decodedCursor.EventID = strings.TrimSpace(decodedCursor.EventID)
	if decodedCursor.SortKey == "" || decodedCursor.EventID == "" {
		return nil, fmt.Errorf("invalid cursor format")
	}

	return &decodedCursor, nil
}
