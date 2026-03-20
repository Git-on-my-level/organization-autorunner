package authaudit

import "time"

const OccurredAtSortKeyLayout = "2006-01-02T15:04:05.000000000Z07:00"

func ParseOccurredAt(raw string) (time.Time, error) {
	return time.Parse(time.RFC3339Nano, raw)
}

func FormatOccurredAtSortKey(occurredAt time.Time) string {
	return occurredAt.UTC().Format(OccurredAtSortKeyLayout)
}
