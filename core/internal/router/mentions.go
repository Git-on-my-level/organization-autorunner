package router

import (
	"regexp"
	"strings"
)

var mentionPattern = regexp.MustCompile(`(?i)(^|[^A-Za-z0-9._-])@([a-z0-9][a-z0-9._-]{0,63})\b`)

func ExtractMentions(text string) []string {
	if text == "" {
		return nil
	}
	matches := mentionPattern.FindAllStringSubmatch(text, -1)
	if len(matches) == 0 {
		return nil
	}
	ordered := make([]string, 0, len(matches))
	seen := make(map[string]struct{}, len(matches))
	for _, match := range matches {
		if len(match) < 3 {
			continue
		}
		handle := strings.ToLower(strings.TrimSpace(match[2]))
		if _, exists := seen[handle]; exists {
			continue
		}
		seen[handle] = struct{}{}
		ordered = append(ordered, handle)
	}
	return ordered
}
