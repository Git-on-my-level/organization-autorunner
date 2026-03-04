package server

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"testing"
	"time"
)

func TestThreadsCreatePatchListAndTimeline(t *testing.T) {
	t.Parallel()

	h := newPrimitivesTestServer(t)
	postJSONExpectStatus(t, h.baseURL+"/actors", `{"actor":{"id":"actor-1","display_name":"Actor One","created_at":"2026-03-04T10:00:00Z"}}`, http.StatusCreated)

	createResp := postJSONExpectStatus(t, h.baseURL+"/threads", `{
		"actor_id":"actor-1",
		"thread":{
			"title":"Incident thread",
			"type":"incident",
			"status":"active",
			"priority":"p1",
			"tags":["ops","backend"],
			"cadence":"daily",
			"next_check_in_at":"2020-01-01T00:00:00Z",
			"current_summary":"Investigating issue",
			"next_actions":["triage"],
			"key_artifacts":["artifact:seed"],
			"provenance":{"sources":["inferred"]},
			"custom_unknown":"preserve_me"
		}
	}`, http.StatusCreated)
	defer createResp.Body.Close()

	var created struct {
		Thread map[string]any `json:"thread"`
	}
	if err := json.NewDecoder(createResp.Body).Decode(&created); err != nil {
		t.Fatalf("decode create thread response: %v", err)
	}
	threadID, _ := created.Thread["id"].(string)
	if threadID == "" {
		t.Fatal("expected created thread id")
	}

	openCommitments, ok := created.Thread["open_commitments"].([]any)
	if !ok || len(openCommitments) != 0 {
		t.Fatalf("expected open_commitments=[], got %#v", created.Thread["open_commitments"])
	}

	patchResp := patchJSONExpectStatus(t, h.baseURL+"/threads/"+threadID, `{
		"actor_id":"actor-1",
		"patch":{
			"title":"Incident thread (updated)",
			"tags":["backend"]
		}
	}`, http.StatusOK)
	defer patchResp.Body.Close()

	var patched struct {
		Thread map[string]any `json:"thread"`
	}
	if err := json.NewDecoder(patchResp.Body).Decode(&patched); err != nil {
		t.Fatalf("decode patch thread response: %v", err)
	}
	if patched.Thread["title"] != "Incident thread (updated)" {
		t.Fatalf("unexpected patched title: %#v", patched.Thread["title"])
	}
	tags, ok := patched.Thread["tags"].([]any)
	if !ok || len(tags) != 1 || tags[0] != "backend" {
		t.Fatalf("unexpected patched tags: %#v", patched.Thread["tags"])
	}

	getResp, err := http.Get(h.baseURL + "/threads/" + threadID)
	if err != nil {
		t.Fatalf("GET /threads/{id}: %v", err)
	}
	defer getResp.Body.Close()
	if getResp.StatusCode != http.StatusOK {
		t.Fatalf("unexpected get thread status: got %d", getResp.StatusCode)
	}

	var loaded struct {
		Thread map[string]any `json:"thread"`
	}
	if err := json.NewDecoder(getResp.Body).Decode(&loaded); err != nil {
		t.Fatalf("decode get thread response: %v", err)
	}
	if loaded.Thread["custom_unknown"] != "preserve_me" {
		t.Fatalf("expected custom unknown field preserved, got %#v", loaded.Thread["custom_unknown"])
	}

	listFilteredResp, err := http.Get(h.baseURL + "/threads?status=active&priority=p1&tag=backend")
	if err != nil {
		t.Fatalf("GET /threads filtered: %v", err)
	}
	defer listFilteredResp.Body.Close()
	if listFilteredResp.StatusCode != http.StatusOK {
		t.Fatalf("unexpected filtered list status: got %d", listFilteredResp.StatusCode)
	}

	var listedFiltered struct {
		Threads []map[string]any `json:"threads"`
	}
	if err := json.NewDecoder(listFilteredResp.Body).Decode(&listedFiltered); err != nil {
		t.Fatalf("decode filtered list response: %v", err)
	}
	if len(listedFiltered.Threads) != 1 {
		t.Fatalf("expected exactly one filtered thread, got %d", len(listedFiltered.Threads))
	}

	staleResp, err := http.Get(h.baseURL + "/threads?stale=true")
	if err != nil {
		t.Fatalf("GET /threads?stale=true: %v", err)
	}
	defer staleResp.Body.Close()
	if staleResp.StatusCode != http.StatusOK {
		t.Fatalf("unexpected stale list status: got %d", staleResp.StatusCode)
	}

	var staleListed struct {
		Threads []map[string]any `json:"threads"`
	}
	if err := json.NewDecoder(staleResp.Body).Decode(&staleListed); err != nil {
		t.Fatalf("decode stale list response: %v", err)
	}
	if len(staleListed.Threads) < 1 {
		t.Fatalf("expected stale list to contain created thread")
	}

	timelineResp, err := http.Get(h.baseURL + "/threads/" + threadID + "/timeline")
	if err != nil {
		t.Fatalf("GET /threads/{id}/timeline: %v", err)
	}
	defer timelineResp.Body.Close()
	if timelineResp.StatusCode != http.StatusOK {
		t.Fatalf("unexpected timeline status: got %d", timelineResp.StatusCode)
	}

	var timeline struct {
		Events []map[string]any `json:"events"`
	}
	if err := json.NewDecoder(timelineResp.Body).Decode(&timeline); err != nil {
		t.Fatalf("decode timeline response: %v", err)
	}
	if len(timeline.Events) < 2 {
		t.Fatalf("expected at least 2 timeline events, got %d", len(timeline.Events))
	}

	for _, event := range timeline.Events {
		refs, ok := event["refs"].([]any)
		if !ok || !containsAny(refs, "snapshot:"+threadID) {
			t.Fatalf("timeline event missing snapshot ref: %#v", event)
		}
	}

	assertTimelineStableOrder(t, timeline.Events)

	lastEvent := timeline.Events[len(timeline.Events)-1]
	payload, ok := lastEvent["payload"].(map[string]any)
	if !ok {
		t.Fatalf("missing event payload: %#v", lastEvent)
	}
	changedFields, ok := payload["changed_fields"].([]any)
	if !ok {
		t.Fatalf("changed_fields missing: %#v", payload)
	}
	gotFields := anyListToSortedStrings(changedFields)
	wantFields := []string{"tags", "title"}
	if len(gotFields) != len(wantFields) || gotFields[0] != wantFields[0] || gotFields[1] != wantFields[1] {
		t.Fatalf("unexpected changed_fields: got %#v want %#v", gotFields, wantFields)
	}

	rejectResp := patchJSONExpectStatus(t, h.baseURL+"/threads/"+threadID, `{
		"actor_id":"actor-1",
		"patch":{"open_commitments":["c-1"]}
	}`, http.StatusBadRequest)
	defer rejectResp.Body.Close()
}

func containsAny(values []any, expected string) bool {
	for _, value := range values {
		if text, ok := value.(string); ok && text == expected {
			return true
		}
	}
	return false
}

func anyListToSortedStrings(values []any) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		text, ok := value.(string)
		if !ok {
			continue
		}
		out = append(out, text)
	}
	sort.Strings(out)
	return out
}

func assertTimelineStableOrder(t *testing.T, events []map[string]any) {
	t.Helper()

	last := time.Time{}
	for index, event := range events {
		ts, ok := event["ts"].(string)
		if !ok {
			t.Fatalf("timeline event missing ts string at index %d: %#v", index, event)
		}
		parsed, err := time.Parse(time.RFC3339Nano, ts)
		if err != nil {
			t.Fatalf("timeline ts parse error at index %d: %v", index, err)
		}
		if index > 0 && parsed.Before(last) {
			t.Fatalf("timeline out of order at index %d: %s before %s", index, parsed, last)
		}
		last = parsed
	}
}

func patchJSONExpectStatus(t *testing.T, url string, body string, expectedStatus int) *http.Response {
	t.Helper()

	req, err := http.NewRequest(http.MethodPatch, url, bytes.NewBufferString(body))
	if err != nil {
		t.Fatalf("build PATCH %s request: %v", url, err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("PATCH %s failed: %v", url, err)
	}
	if resp.StatusCode != expectedStatus {
		defer resp.Body.Close()
		bodyBytes, _ := io.ReadAll(resp.Body)
		t.Fatalf("PATCH %s unexpected status: got %d want %d body=%s", url, resp.StatusCode, expectedStatus, string(bodyBytes))
	}
	return resp
}
