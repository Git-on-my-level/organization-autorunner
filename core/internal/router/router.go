package router

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type Config struct {
	BaseURL           string
	WorkspaceID       string
	WorkspaceName     string
	StatePath         string
	AuthStatePath     string
	Username          string
	BootstrapToken    string
	InviteToken       string
	VerifyTLS         bool
	PrincipalCacheTTL time.Duration
	ReconnectDelay    time.Duration
}

type principalCache struct {
	loadedAt time.Time
	byHandle map[string]map[string]any
}

type Service struct {
	cfg    Config
	client *Client
	state  *StateStore

	cache principalCache
}

func NewService(cfg Config, client *Client, state *StateStore) *Service {
	return &Service{
		cfg:    cfg,
		client: client,
		state:  state,
		cache: principalCache{
			byHandle: map[string]map[string]any{},
		},
	}
}

func (s *Service) Run(ctx context.Context) error {
	if s.cfg.PrincipalCacheTTL <= 0 {
		s.cfg.PrincipalCacheTTL = time.Minute
	}
	if s.cfg.ReconnectDelay <= 0 {
		s.cfg.ReconnectDelay = 3 * time.Second
	}
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		lastEventID := s.state.LastEventID()
		_ = s.state.Update(map[string]any{
			"router_last_stream_connected_at":    utcNowISO(),
			"router_stream_resume_from_event_id": lastEventID,
		})
		items, errs := s.client.StreamEvents(ctx, MessagePostedEvent, lastEventID)
	streamLoop:
		for {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case err, ok := <-errs:
				if ok && err != nil && ctx.Err() == nil {
					_ = s.state.Update(map[string]any{
						"router_last_stream_error_at": utcNowISO(),
						"router_last_stream_error":    err.Error(),
					})
					time.Sleep(s.cfg.ReconnectDelay)
					break streamLoop
				}
				return ctx.Err()
			case item, ok := <-items:
				if !ok {
					time.Sleep(s.cfg.ReconnectDelay)
					break streamLoop
				}
				var wrapper map[string]any
				if err := json.Unmarshal([]byte(item.Data), &wrapper); err != nil {
					_ = s.state.Update(map[string]any{
						"router_last_stream_error_at": utcNowISO(),
						"router_last_stream_error":    err.Error(),
					})
					continue
				}
				event := eventFromStream(wrapper)
				if event == nil {
					continue
				}
				if err := s.handleEvent(ctx, event); err != nil {
					_ = s.state.Update(map[string]any{
						"router_last_stream_error_at": utcNowISO(),
						"router_last_stream_error":    err.Error(),
					})
				}
				if eventID := anyString(event["id"]); eventID != "" {
					_ = s.state.SetLastEventID(eventID)
				}
			}
		}
	}
}

func (s *Service) handleEvent(ctx context.Context, event map[string]any) error {
	eventID := anyString(event["id"])
	text := extractMessageText(event)
	handles := ExtractMentions(text)
	updates := map[string]any{
		"router_last_message_seen_at":       utcNowISO(),
		"router_last_message_seen_event_id": eventID,
	}
	if len(handles) > 0 {
		updates["router_last_tagged_message_event_id"] = eventID
		updates["router_last_tagged_message_seen_at"] = utcNowISO()
		updates["router_last_tagged_handles"] = handles
		updates["router_last_tagged_message_preview"] = compactText(text, 140)
	}
	_ = s.state.Update(updates)
	if len(handles) == 0 {
		return nil
	}
	if err := s.loadPrincipals(ctx, false); err != nil {
		return err
	}
	routed := make([]string, 0, len(handles))
	for _, handle := range handles {
		ok, err := s.routeMention(ctx, handle, event, text)
		if err != nil {
			_ = s.emitException(ctx, anyString(event["thread_id"]), eventID, handle, "mention_routing_failed", fmt.Sprintf("Failed routing @%s", handle))
			continue
		}
		if ok {
			routed = append(routed, handle)
		}
	}
	if len(routed) == 0 {
		return nil
	}
	return s.state.Update(map[string]any{
		"router_last_routed_event_id": eventID,
		"router_last_routed_at":       utcNowISO(),
		"router_last_routed_handles":  routed,
	})
}

func (s *Service) loadPrincipals(ctx context.Context, force bool) error {
	if !force && time.Since(s.cache.loadedAt) < s.cfg.PrincipalCacheTTL {
		return nil
	}
	principals, err := s.client.ListPrincipals(ctx, 200)
	if err != nil {
		return err
	}
	byHandle := map[string]map[string]any{}
	for _, principal := range principals {
		if revoked, _ := principal["revoked"].(bool); revoked {
			continue
		}
		if anyString(principal["principal_kind"]) != "agent" {
			continue
		}
		username := anyString(principal["username"])
		if username == "" {
			continue
		}
		byHandle[username] = principal
	}
	s.cache.loadedAt = time.Now()
	s.cache.byHandle = byHandle
	return nil
}

func (s *Service) routeMention(ctx context.Context, handle string, event map[string]any, text string) (bool, error) {
	threadID := anyString(event["thread_id"])
	eventID := anyString(event["id"])
	if threadID == "" || eventID == "" {
		return false, nil
	}
	principal := s.cache.byHandle[handle]
	if principal == nil {
		return false, s.emitException(ctx, threadID, eventID, handle, "unknown_agent_handle", fmt.Sprintf("Unknown tagged agent @%s", handle))
	}
	registration, err := s.loadRegistration(ctx, handle)
	if err != nil {
		return false, err
	}
	if registration == nil {
		return false, s.emitException(ctx, threadID, eventID, handle, "missing_agent_registration", fmt.Sprintf("Tagged agent @%s has no registration document", handle))
	}
	if registration.ActorID != anyString(principal["actor_id"]) {
		return false, s.emitException(ctx, threadID, eventID, handle, "registration_actor_mismatch", fmt.Sprintf("Tagged agent @%s registration actor does not match principal", handle))
	}
	if !registration.SupportsWorkspace(s.cfg.WorkspaceID) {
		return false, s.emitException(ctx, threadID, eventID, handle, "agent_not_bound_to_workspace", fmt.Sprintf("Tagged agent @%s is not enabled for workspace %s", handle, s.cfg.WorkspaceID))
	}
	if registration.Status != "active" {
		return false, s.emitException(ctx, threadID, eventID, handle, "agent_bridge_not_ready", fmt.Sprintf("Tagged agent @%s is registered but not wakeable until its bridge checks in", handle))
	}
	if registration.BridgeCheckinEventID == "" {
		return false, s.emitException(ctx, threadID, eventID, handle, "agent_bridge_not_checked_in", fmt.Sprintf("Tagged agent @%s has no bridge check-in event yet", handle))
	}
	checkin, err := s.loadBridgeCheckin(ctx, registration.BridgeCheckinEventID)
	if err != nil {
		return false, err
	}
	if checkin == nil {
		return false, s.emitException(ctx, threadID, eventID, handle, "agent_bridge_not_checked_in", fmt.Sprintf("Tagged agent @%s has no valid bridge check-in event yet", handle))
	}
	if checkin.Handle != "" && checkin.Handle != handle {
		return false, s.emitException(ctx, threadID, eventID, handle, "agent_bridge_handle_mismatch", fmt.Sprintf("Tagged agent @%s bridge check-in handle does not match registration", handle))
	}
	if registration.BridgeSigningPublicKeySPKIB64 == "" {
		return false, s.emitException(ctx, threadID, eventID, handle, "agent_bridge_proof_missing", fmt.Sprintf("Tagged agent @%s registration is missing its bridge proof key", handle))
	}
	if !VerifyBridgeCheckinSignature(registration.BridgeSigningPublicKeySPKIB64, *checkin) {
		return false, s.emitException(ctx, threadID, eventID, handle, "agent_bridge_proof_invalid", fmt.Sprintf("Tagged agent @%s has an invalid bridge readiness proof", handle))
	}
	if checkin.ActorID != registration.ActorID {
		return false, s.emitException(ctx, threadID, eventID, handle, "agent_bridge_actor_mismatch", fmt.Sprintf("Tagged agent @%s bridge check-in actor does not match registration actor", handle))
	}
	if !checkin.ReadyForWorkspace(s.cfg.WorkspaceID, nowUTC()) {
		return false, s.emitException(ctx, threadID, eventID, handle, "agent_bridge_checkin_stale", fmt.Sprintf("Tagged agent @%s has a stale bridge check-in and is not wakeable right now", handle))
	}
	workspace, err := s.client.GetThreadWorkspace(ctx, threadID)
	if err != nil {
		return false, err
	}
	thread, _ := workspace["thread"].(map[string]any)
	wakeupID := WakeupArtifactID(s.cfg.WorkspaceID, threadID, eventID, registration.ActorID)
	sessionKey := fmt.Sprintf("oar:%s:%s:%s", s.cfg.WorkspaceID, threadID, handle)
	packet := WakePacket{
		WakeupID:             wakeupID,
		Handle:               handle,
		ActorID:              registration.ActorID,
		WorkspaceID:          s.cfg.WorkspaceID,
		WorkspaceName:        s.cfg.WorkspaceName,
		ThreadID:             threadID,
		ThreadTitle:          firstNonEmpty(anyString(thread["title"]), threadID),
		TriggerEventID:       eventID,
		TriggerCreatedAt:     anyString(event["ts"]),
		TriggerAuthorActorID: anyString(event["actor_id"]),
		TriggerText:          text,
		CurrentSummary:       anyString(thread["current_summary"]),
		SessionKey:           sessionKey,
		OARBaseURL:           strings.TrimRight(s.cfg.BaseURL, "/"),
		ThreadContextURL:     fmt.Sprintf("%s/threads/%s/context", strings.TrimRight(s.cfg.BaseURL, "/"), threadID),
		ThreadWorkspaceURL:   fmt.Sprintf("%s/threads/%s/workspace", strings.TrimRight(s.cfg.BaseURL, "/"), threadID),
		TriggerEventURL:      fmt.Sprintf("%s/events/%s", strings.TrimRight(s.cfg.BaseURL, "/"), eventID),
		CLIThreadInspect:     fmt.Sprintf("oar threads inspect --thread-id %s --json", threadID),
		CLIThreadWorkspace:   fmt.Sprintf("oar threads workspace --thread-id %s --include-related-event-content --json", threadID),
	}
	artifact := map[string]any{
		"id":              wakeupID,
		"kind":            WakeArtifactKind,
		"summary":         fmt.Sprintf("Wake packet for @%s", handle),
		"refs":            []string{fmt.Sprintf("thread:%s", threadID), fmt.Sprintf("event:%s", eventID)},
		"target_handle":   handle,
		"target_actor_id": registration.ActorID,
		"workspace_id":    s.cfg.WorkspaceID,
		"thread_id":       threadID,
	}
	if err := s.client.CreateArtifact(ctx, artifact, packet.ToContent(), "structured"); err != nil {
		if apiErr, ok := err.(*Error); !ok || apiErr.StatusCode != 409 {
			return false, err
		}
	}
	if err := s.client.CreateEvent(ctx, map[string]any{
		"type":      WakeRequestEvent,
		"thread_id": threadID,
		"summary":   fmt.Sprintf("Wake requested for @%s", handle),
		"refs": []string{
			fmt.Sprintf("thread:%s", threadID),
			fmt.Sprintf("event:%s", eventID),
			fmt.Sprintf("artifact:%s", wakeupID),
		},
		"payload": map[string]any{
			"wakeup_id":        wakeupID,
			"wake_artifact_id": wakeupID,
			"target_handle":    handle,
			"target_actor_id":  registration.ActorID,
			"workspace_id":     s.cfg.WorkspaceID,
			"workspace_name":   s.cfg.WorkspaceName,
			"thread_id":        threadID,
			"trigger_event_id": eventID,
			"session_key":      sessionKey,
		},
		"provenance": map[string]any{
			"sources": []string{fmt.Sprintf("actor_statement:%s", eventID)},
		},
	}, WakeupRequestKey(s.cfg.WorkspaceID, threadID, eventID, registration.ActorID)); err != nil {
		return false, err
	}
	return true, nil
}

func (s *Service) loadRegistration(ctx context.Context, handle string) (*AgentRegistration, error) {
	payload, err := s.client.GetDocument(ctx, RegistrationDocumentID(handle))
	if err != nil {
		if apiErr, ok := err.(*Error); ok && apiErr.StatusCode == 404 {
			return nil, nil
		}
		return nil, err
	}
	revision, _ := payload["revision"].(map[string]any)
	content, _ := revision["content"].(map[string]any)
	if content == nil {
		return nil, nil
	}
	registration, err := decodeIntoMap[AgentRegistration](content)
	if err != nil {
		return nil, err
	}
	return &registration, nil
}

func (s *Service) loadBridgeCheckin(ctx context.Context, eventID string) (*AgentBridgeCheckin, error) {
	payload, err := s.client.GetEvent(ctx, eventID)
	if err != nil {
		if apiErr, ok := err.(*Error); ok && apiErr.StatusCode == 404 {
			return nil, nil
		}
		return nil, err
	}
	event, _ := payload["event"].(map[string]any)
	if anyString(event["type"]) != BridgeCheckedInEvent {
		return nil, nil
	}
	content, _ := event["payload"].(map[string]any)
	if content == nil {
		return nil, nil
	}
	checkin, err := decodeIntoMap[AgentBridgeCheckin](content)
	if err != nil {
		return nil, err
	}
	return &checkin, nil
}

func (s *Service) emitException(ctx context.Context, threadID string, eventID string, handle string, code string, summary string) error {
	requestKey := fmt.Sprintf("exc-%s-%s-%s", code, handle, eventID)
	return s.client.CreateEvent(ctx, map[string]any{
		"type":      "exception_raised",
		"thread_id": threadID,
		"summary":   summary,
		"refs":      []string{fmt.Sprintf("thread:%s", threadID), fmt.Sprintf("event:%s", eventID)},
		"payload": map[string]any{
			"subtype": code,
			"code":    code,
			"handle":  handle,
		},
		"provenance": map[string]any{
			"sources": []string{fmt.Sprintf("actor_statement:%s", eventID)},
		},
	}, requestKey)
}

type WakePacket struct {
	WakeupID             string
	Handle               string
	ActorID              string
	WorkspaceID          string
	WorkspaceName        string
	ThreadID             string
	ThreadTitle          string
	TriggerEventID       string
	TriggerCreatedAt     string
	TriggerAuthorActorID string
	TriggerText          string
	CurrentSummary       string
	SessionKey           string
	OARBaseURL           string
	ThreadContextURL     string
	ThreadWorkspaceURL   string
	TriggerEventURL      string
	CLIThreadInspect     string
	CLIThreadWorkspace   string
}

func (p WakePacket) ToContent() map[string]any {
	return map[string]any{
		"version":   "agent-wake/v1",
		"wakeup_id": p.WakeupID,
		"target": map[string]any{
			"handle":   p.Handle,
			"actor_id": p.ActorID,
		},
		"workspace": map[string]any{
			"id":   p.WorkspaceID,
			"name": p.WorkspaceName,
		},
		"thread": map[string]any{
			"id":    p.ThreadID,
			"title": p.ThreadTitle,
		},
		"trigger": map[string]any{
			"kind":             "mention",
			"message_event_id": p.TriggerEventID,
			"created_at":       p.TriggerCreatedAt,
			"author_actor_id":  p.TriggerAuthorActorID,
			"text":             p.TriggerText,
		},
		"context_inline": map[string]any{
			"current_summary": p.CurrentSummary,
		},
		"session_key": p.SessionKey,
		"context_fetch": map[string]any{
			"preferred": "threads.workspace",
			"cli":       []string{p.CLIThreadWorkspace, p.CLIThreadInspect},
			"api": map[string]any{
				"thread":        fmt.Sprintf("%s/threads/%s", strings.TrimRight(p.OARBaseURL, "/"), p.ThreadID),
				"context":       p.ThreadContextURL,
				"workspace":     p.ThreadWorkspaceURL,
				"trigger_event": p.TriggerEventURL,
			},
		},
		"reply_refs": []string{
			fmt.Sprintf("thread:%s", p.ThreadID),
			fmt.Sprintf("event:%s", p.TriggerEventID),
			fmt.Sprintf("artifact:%s", p.WakeupID),
		},
	}
}

func extractMessageText(event map[string]any) string {
	payload, _ := event["payload"].(map[string]any)
	for _, key := range []string{"text", "message", "body", "content"} {
		if value := anyString(payload[key]); value != "" {
			return value
		}
	}
	if body := anyString(event["body"]); body != "" {
		return body
	}
	return anyString(event["summary"])
}

func eventFromStream(wrapper map[string]any) map[string]any {
	if nested, ok := wrapper["event"].(map[string]any); ok {
		return nested
	}
	return wrapper
}
