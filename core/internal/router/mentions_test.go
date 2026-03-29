package router

import "testing"

func TestExtractMentionsDedupesAndPreservesOrder(t *testing.T) {
	got := ExtractMentions("ping @hermes and @zeroclaw then @hermes again")
	want := []string{"hermes", "zeroclaw"}
	if len(got) != len(want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("expected %v, got %v", want, got)
		}
	}
}

func TestExtractMentionsIgnoresEmailLikePatterns(t *testing.T) {
	got := ExtractMentions("email a@b.com but tag @real_agent")
	want := []string{"real_agent"}
	if len(got) != len(want) || got[0] != want[0] {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestExtractMentionsSupportsMaxLengthHandle(t *testing.T) {
	handle := "a" + "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	if len(handle) != 64 {
		t.Fatalf("expected 64-char handle, got %d", len(handle))
	}
	got := ExtractMentions("ping @" + handle)
	if len(got) != 1 || got[0] != handle {
		t.Fatalf("expected [%s], got %v", handle, got)
	}
}
