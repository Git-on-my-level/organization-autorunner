package primitives

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

var ErrNotFound = errors.New("not found")

type ArtifactListFilter struct {
	Kind          string
	ThreadID      string
	CreatedBefore string
	CreatedAfter  string
}

type ThreadListFilter struct {
	Status   string
	Priority string
	Tag      string
	Stale    *bool
	Now      time.Time
}

type Store struct {
	db                 *sql.DB
	artifactContentDir string
}

type PatchSnapshotResult struct {
	Snapshot map[string]any
	Event    map[string]any
}

func NewStore(db *sql.DB, artifactContentDir string) *Store {
	return &Store{db: db, artifactContentDir: artifactContentDir}
}

func (s *Store) AppendEvent(ctx context.Context, actorID string, event map[string]any) (map[string]any, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("primitives store database is not initialized")
	}

	body := cloneMap(event)
	body["id"] = uuid.NewString()
	body["ts"] = time.Now().UTC().Format(time.RFC3339Nano)
	body["actor_id"] = actorID

	typeValue, _ := body["type"].(string)
	threadID, _ := body["thread_id"].(string)
	refs, err := normalizeStringSlice(body["refs"])
	if err != nil {
		return nil, fmt.Errorf("event.refs: %w", err)
	}

	refsJSON, err := json.Marshal(refs)
	if err != nil {
		return nil, fmt.Errorf("marshal event refs: %w", err)
	}

	payload := map[string]any{}
	if rawPayload, ok := body["payload"]; ok && rawPayload != nil {
		switch p := rawPayload.(type) {
		case map[string]any:
			payload = p
		default:
			return nil, fmt.Errorf("event.payload must be an object when provided")
		}
	}

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal event payload: %w", err)
	}

	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal event body: %w", err)
	}

	_, err = s.db.ExecContext(
		ctx,
		`INSERT INTO events(id, type, ts, actor_id, thread_id, refs_json, payload_json, body_json, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		body["id"],
		typeValue,
		body["ts"],
		actorID,
		threadID,
		string(refsJSON),
		string(payloadJSON),
		string(bodyJSON),
	)
	if err != nil {
		return nil, fmt.Errorf("insert event: %w", err)
	}

	return body, nil
}

func (s *Store) GetEvent(ctx context.Context, id string) (map[string]any, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("primitives store database is not initialized")
	}

	var (
		eventID     string
		typeValue   string
		ts          string
		actorID     string
		threadID    sql.NullString
		refsJSON    string
		payloadJSON string
		bodyJSON    sql.NullString
	)
	err := s.db.QueryRowContext(
		ctx,
		`SELECT id, type, ts, actor_id, thread_id, refs_json, payload_json, body_json FROM events WHERE id = ?`,
		id,
	).Scan(&eventID, &typeValue, &ts, &actorID, &threadID, &refsJSON, &payloadJSON, &bodyJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query event: %w", err)
	}

	if bodyJSON.Valid && strings.TrimSpace(bodyJSON.String) != "" && bodyJSON.String != "{}" {
		var body map[string]any
		if err := json.Unmarshal([]byte(bodyJSON.String), &body); err != nil {
			return nil, fmt.Errorf("decode event body: %w", err)
		}
		return body, nil
	}

	var refs []string
	if err := json.Unmarshal([]byte(refsJSON), &refs); err != nil {
		return nil, fmt.Errorf("decode event refs: %w", err)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
		return nil, fmt.Errorf("decode event payload: %w", err)
	}

	out := map[string]any{
		"id":       eventID,
		"type":     typeValue,
		"ts":       ts,
		"actor_id": actorID,
		"refs":     refs,
		"payload":  payload,
	}
	if threadID.Valid {
		out["thread_id"] = threadID.String
	}

	return out, nil
}

func (s *Store) CreateArtifact(ctx context.Context, actorID string, artifact map[string]any, content any, contentType string) (map[string]any, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("primitives store database is not initialized")
	}
	if strings.TrimSpace(s.artifactContentDir) == "" {
		return nil, fmt.Errorf("artifact content directory is not configured")
	}

	kind, ok := artifact["kind"].(string)
	if !ok || strings.TrimSpace(kind) == "" {
		return nil, fmt.Errorf("artifact.kind is required")
	}

	refs, err := normalizeStringSlice(artifact["refs"])
	if err != nil {
		return nil, fmt.Errorf("artifact.refs: %w", err)
	}

	encodedContent, err := encodeContent(content)
	if err != nil {
		return nil, err
	}

	metadata := cloneMap(artifact)
	metadata["id"] = uuid.NewString()
	metadata["created_at"] = time.Now().UTC().Format(time.RFC3339Nano)
	metadata["created_by"] = actorID
	metadata["content_type"] = contentType
	metadata["content_path"] = filepath.Join(s.artifactContentDir, metadata["id"].(string))

	contentPath := metadata["content_path"].(string)
	file, err := os.OpenFile(contentPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, fmt.Errorf("create artifact content file: %w", err)
	}

	if _, err := file.Write(encodedContent); err != nil {
		_ = file.Close()
		_ = os.Remove(contentPath)
		return nil, fmt.Errorf("write artifact content: %w", err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(contentPath)
		return nil, fmt.Errorf("close artifact content file: %w", err)
	}

	refsJSON, err := json.Marshal(refs)
	if err != nil {
		_ = os.Remove(contentPath)
		return nil, fmt.Errorf("marshal artifact refs: %w", err)
	}

	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		_ = os.Remove(contentPath)
		return nil, fmt.Errorf("marshal artifact metadata: %w", err)
	}

	_, err = s.db.ExecContext(
		ctx,
		`INSERT INTO artifacts(id, kind, created_at, created_by, content_type, content_path, refs_json, metadata_json)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		metadata["id"],
		kind,
		metadata["created_at"],
		actorID,
		contentType,
		contentPath,
		string(refsJSON),
		string(metadataJSON),
	)
	if err != nil {
		_ = os.Remove(contentPath)
		return nil, fmt.Errorf("insert artifact: %w", err)
	}

	return metadata, nil
}

func (s *Store) GetArtifact(ctx context.Context, id string) (map[string]any, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("primitives store database is not initialized")
	}

	var metadataJSON string
	err := s.db.QueryRowContext(ctx, `SELECT metadata_json FROM artifacts WHERE id = ?`, id).Scan(&metadataJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query artifact metadata: %w", err)
	}

	var metadata map[string]any
	if err := json.Unmarshal([]byte(metadataJSON), &metadata); err != nil {
		return nil, fmt.Errorf("decode artifact metadata: %w", err)
	}

	return metadata, nil
}

func (s *Store) GetArtifactContent(ctx context.Context, id string) ([]byte, string, error) {
	if s == nil || s.db == nil {
		return nil, "", fmt.Errorf("primitives store database is not initialized")
	}

	var contentPath string
	var contentType string
	err := s.db.QueryRowContext(ctx, `SELECT content_path, content_type FROM artifacts WHERE id = ?`, id).Scan(&contentPath, &contentType)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", ErrNotFound
	}
	if err != nil {
		return nil, "", fmt.Errorf("query artifact content path: %w", err)
	}

	body, err := os.ReadFile(contentPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, "", ErrNotFound
		}
		return nil, "", fmt.Errorf("read artifact content: %w", err)
	}

	return body, contentType, nil
}

func (s *Store) ListArtifacts(ctx context.Context, filter ArtifactListFilter) ([]map[string]any, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("primitives store database is not initialized")
	}

	query := `SELECT metadata_json FROM artifacts WHERE 1=1`
	args := make([]any, 0)

	if filter.Kind != "" {
		query += ` AND kind = ?`
		args = append(args, filter.Kind)
	}
	if filter.CreatedAfter != "" {
		query += ` AND created_at >= ?`
		args = append(args, filter.CreatedAfter)
	}
	if filter.CreatedBefore != "" {
		query += ` AND created_at <= ?`
		args = append(args, filter.CreatedBefore)
	}
	query += ` ORDER BY created_at ASC, id ASC`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query artifacts: %w", err)
	}
	defer rows.Close()

	artifacts := make([]map[string]any, 0)
	for rows.Next() {
		var metadataJSON string
		if err := rows.Scan(&metadataJSON); err != nil {
			return nil, fmt.Errorf("scan artifact row: %w", err)
		}

		var metadata map[string]any
		if err := json.Unmarshal([]byte(metadataJSON), &metadata); err != nil {
			return nil, fmt.Errorf("decode artifact metadata: %w", err)
		}

		if filter.ThreadID != "" {
			refs, err := normalizeStringSlice(metadata["refs"])
			if err != nil {
				return nil, fmt.Errorf("decode artifact refs for filter: %w", err)
			}
			if !containsThreadRef(refs, filter.ThreadID) {
				continue
			}
		}

		artifacts = append(artifacts, metadata)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate artifact rows: %w", err)
	}

	return artifacts, nil
}

func (s *Store) GetSnapshot(ctx context.Context, id string) (map[string]any, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("primitives store database is not initialized")
	}

	row, err := s.getSnapshotRow(ctx, id)
	if err != nil {
		return nil, err
	}
	return row.ToSnapshotMap()
}

func (s *Store) PatchSnapshot(ctx context.Context, actorID string, id string, patch map[string]any) (PatchSnapshotResult, error) {
	if s == nil || s.db == nil {
		return PatchSnapshotResult{}, fmt.Errorf("primitives store database is not initialized")
	}
	if strings.TrimSpace(actorID) == "" {
		return PatchSnapshotResult{}, fmt.Errorf("actorID is required")
	}
	if patch == nil {
		return PatchSnapshotResult{}, fmt.Errorf("snapshot patch is required")
	}

	var (
		snapshotID     string
		snapshotKind   string
		threadID       sql.NullString
		provenanceJSON string
		bodyJSON       string
	)
	err := s.db.QueryRowContext(
		ctx,
		`SELECT id, kind, thread_id, provenance_json, body_json FROM snapshots WHERE id = ?`,
		id,
	).Scan(&snapshotID, &snapshotKind, &threadID, &provenanceJSON, &bodyJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return PatchSnapshotResult{}, ErrNotFound
	}
	if err != nil {
		return PatchSnapshotResult{}, fmt.Errorf("query snapshot before patch: %w", err)
	}

	current := map[string]any{}
	if strings.TrimSpace(bodyJSON) != "" {
		if err := json.Unmarshal([]byte(bodyJSON), &current); err != nil {
			return PatchSnapshotResult{}, fmt.Errorf("decode current snapshot body: %w", err)
		}
	}

	changedFields := make([]string, 0, len(patch))
	for key, incoming := range patch {
		existing, exists := current[key]
		if !exists || !reflect.DeepEqual(existing, incoming) {
			changedFields = append(changedFields, key)
		}
		current[key] = incoming
	}
	sort.Strings(changedFields)

	updatedAt := time.Now().UTC().Format(time.RFC3339Nano)

	updatedBodyJSON, err := json.Marshal(current)
	if err != nil {
		return PatchSnapshotResult{}, fmt.Errorf("encode patched snapshot body: %w", err)
	}

	_, err = s.db.ExecContext(
		ctx,
		`UPDATE snapshots SET body_json = ?, updated_at = ?, updated_by = ? WHERE id = ?`,
		string(updatedBodyJSON),
		updatedAt,
		actorID,
		snapshotID,
	)
	if err != nil {
		return PatchSnapshotResult{}, fmt.Errorf("update snapshot: %w", err)
	}

	eventPayload := map[string]any{
		"changed_fields": changedFields,
	}
	event := map[string]any{
		"type":       "snapshot_updated",
		"refs":       []string{"snapshot:" + snapshotID},
		"summary":    "snapshot updated",
		"payload":    eventPayload,
		"provenance": map[string]any{"sources": []string{"inferred"}},
	}
	if threadID.Valid {
		event["thread_id"] = threadID.String
	}

	emittedEvent, err := s.AppendEvent(ctx, actorID, event)
	if err != nil {
		return PatchSnapshotResult{}, fmt.Errorf("emit snapshot_updated event: %w", err)
	}

	provenance := map[string]any{}
	if strings.TrimSpace(provenanceJSON) != "" {
		if err := json.Unmarshal([]byte(provenanceJSON), &provenance); err != nil {
			return PatchSnapshotResult{}, fmt.Errorf("decode snapshot provenance: %w", err)
		}
	}

	current["id"] = snapshotID
	if _, hasType := current["type"]; !hasType {
		current["type"] = snapshotKind
	}
	current["updated_at"] = updatedAt
	current["updated_by"] = actorID
	if threadID.Valid {
		current["thread_id"] = threadID.String
	}
	current["provenance"] = provenance

	return PatchSnapshotResult{
		Snapshot: current,
		Event:    emittedEvent,
	}, nil
}

func (s *Store) CreateThread(ctx context.Context, actorID string, thread map[string]any) (PatchSnapshotResult, error) {
	if s == nil || s.db == nil {
		return PatchSnapshotResult{}, fmt.Errorf("primitives store database is not initialized")
	}
	if strings.TrimSpace(actorID) == "" {
		return PatchSnapshotResult{}, fmt.Errorf("actorID is required")
	}
	if thread == nil {
		return PatchSnapshotResult{}, fmt.Errorf("thread is required")
	}

	threadID := uuid.NewString()
	updatedAt := time.Now().UTC().Format(time.RFC3339Nano)

	body := cloneMap(thread)
	body["open_commitments"] = []string{}

	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return PatchSnapshotResult{}, fmt.Errorf("marshal thread snapshot body: %w", err)
	}

	provenance := map[string]any{}
	if rawProvenance, ok := thread["provenance"].(map[string]any); ok {
		provenance = rawProvenance
	}
	provenanceJSON, err := json.Marshal(provenance)
	if err != nil {
		return PatchSnapshotResult{}, fmt.Errorf("marshal thread provenance: %w", err)
	}

	_, err = s.db.ExecContext(
		ctx,
		`INSERT INTO snapshots(id, kind, thread_id, updated_at, updated_by, body_json, provenance_json)
		 VALUES (?, 'thread', ?, ?, ?, ?, ?)`,
		threadID,
		threadID,
		updatedAt,
		actorID,
		string(bodyJSON),
		string(provenanceJSON),
	)
	if err != nil {
		return PatchSnapshotResult{}, fmt.Errorf("insert thread snapshot: %w", err)
	}

	changedFields := make([]string, 0, len(body))
	for key := range body {
		changedFields = append(changedFields, key)
	}
	sort.Strings(changedFields)

	event := map[string]any{
		"type":       "snapshot_updated",
		"thread_id":  threadID,
		"refs":       []string{"snapshot:" + threadID},
		"summary":    "thread snapshot created",
		"payload":    map[string]any{"changed_fields": changedFields},
		"provenance": map[string]any{"sources": []string{"inferred"}},
	}
	emittedEvent, err := s.AppendEvent(ctx, actorID, event)
	if err != nil {
		return PatchSnapshotResult{}, fmt.Errorf("emit thread snapshot_updated event: %w", err)
	}

	out := cloneMap(body)
	out["id"] = threadID
	// Thread domain `type` is provided by caller (thread_type enum).
	out["thread_id"] = threadID
	out["updated_at"] = updatedAt
	out["updated_by"] = actorID
	out["provenance"] = provenance

	return PatchSnapshotResult{
		Snapshot: out,
		Event:    emittedEvent,
	}, nil
}

func (s *Store) GetThread(ctx context.Context, id string) (map[string]any, error) {
	row, err := s.getSnapshotRow(ctx, id)
	if err != nil {
		return nil, err
	}
	if row.Kind != "thread" {
		return nil, ErrNotFound
	}
	return row.ToSnapshotMap()
}

func (s *Store) PatchThread(ctx context.Context, actorID string, id string, patch map[string]any) (PatchSnapshotResult, error) {
	row, err := s.getSnapshotRow(ctx, id)
	if err != nil {
		return PatchSnapshotResult{}, err
	}
	if row.Kind != "thread" {
		return PatchSnapshotResult{}, ErrNotFound
	}
	return s.PatchSnapshot(ctx, actorID, id, patch)
}

func (s *Store) ListThreads(ctx context.Context, filter ThreadListFilter) ([]map[string]any, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("primitives store database is not initialized")
	}

	rows, err := s.db.QueryContext(
		ctx,
		`SELECT id, kind, thread_id, updated_at, updated_by, body_json, provenance_json
		 FROM snapshots
		 WHERE kind = 'thread'
		 ORDER BY updated_at DESC, id ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("query threads: %w", err)
	}
	defer rows.Close()

	now := filter.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}

	threads := make([]map[string]any, 0)
	for rows.Next() {
		row, err := scanSnapshotRow(rows)
		if err != nil {
			return nil, err
		}
		snapshot, err := row.ToSnapshotMap()
		if err != nil {
			return nil, err
		}

		if filter.Status != "" {
			status, _ := snapshot["status"].(string)
			if status != filter.Status {
				continue
			}
		}
		if filter.Priority != "" {
			priority, _ := snapshot["priority"].(string)
			if priority != filter.Priority {
				continue
			}
		}
		if filter.Tag != "" {
			tags, err := normalizeStringSlice(snapshot["tags"])
			if err != nil || !containsString(tags, filter.Tag) {
				continue
			}
		}
		if filter.Stale != nil {
			stale := threadIsStale(snapshot, now)
			if stale != *filter.Stale {
				continue
			}
		}

		threads = append(threads, snapshot)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate threads: %w", err)
	}

	return threads, nil
}

func (s *Store) ListEventsByThread(ctx context.Context, threadID string) ([]map[string]any, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("primitives store database is not initialized")
	}

	rows, err := s.db.QueryContext(
		ctx,
		`SELECT id, type, ts, actor_id, thread_id, refs_json, payload_json, body_json
		 FROM events
		 WHERE thread_id = ?
		 ORDER BY ts ASC, id ASC`,
		threadID,
	)
	if err != nil {
		return nil, fmt.Errorf("query thread events: %w", err)
	}
	defer rows.Close()

	events := make([]map[string]any, 0)
	for rows.Next() {
		var (
			eventID     string
			typeValue   string
			ts          string
			actorID     string
			thread      sql.NullString
			refsJSON    string
			payloadJSON string
			bodyJSON    sql.NullString
		)
		if err := rows.Scan(&eventID, &typeValue, &ts, &actorID, &thread, &refsJSON, &payloadJSON, &bodyJSON); err != nil {
			return nil, fmt.Errorf("scan thread event: %w", err)
		}

		if bodyJSON.Valid && strings.TrimSpace(bodyJSON.String) != "" && bodyJSON.String != "{}" {
			body := map[string]any{}
			if err := json.Unmarshal([]byte(bodyJSON.String), &body); err != nil {
				return nil, fmt.Errorf("decode event body: %w", err)
			}
			events = append(events, body)
			continue
		}

		refs := make([]string, 0)
		if err := json.Unmarshal([]byte(refsJSON), &refs); err != nil {
			return nil, fmt.Errorf("decode event refs: %w", err)
		}
		payload := map[string]any{}
		if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
			return nil, fmt.Errorf("decode event payload: %w", err)
		}

		event := map[string]any{
			"id":       eventID,
			"type":     typeValue,
			"ts":       ts,
			"actor_id": actorID,
			"refs":     refs,
			"payload":  payload,
		}
		if thread.Valid {
			event["thread_id"] = thread.String
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate thread events: %w", err)
	}

	return events, nil
}

type snapshotRow struct {
	ID             string
	Kind           string
	ThreadID       sql.NullString
	UpdatedAt      string
	UpdatedBy      string
	BodyJSON       string
	ProvenanceJSON string
}

func (s *Store) getSnapshotRow(ctx context.Context, id string) (snapshotRow, error) {
	if s == nil || s.db == nil {
		return snapshotRow{}, fmt.Errorf("primitives store database is not initialized")
	}

	row := snapshotRow{}
	err := s.db.QueryRowContext(
		ctx,
		`SELECT id, kind, thread_id, updated_at, updated_by, body_json, provenance_json FROM snapshots WHERE id = ?`,
		id,
	).Scan(&row.ID, &row.Kind, &row.ThreadID, &row.UpdatedAt, &row.UpdatedBy, &row.BodyJSON, &row.ProvenanceJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return snapshotRow{}, ErrNotFound
	}
	if err != nil {
		return snapshotRow{}, fmt.Errorf("query snapshot row: %w", err)
	}
	return row, nil
}

func scanSnapshotRow(scanner interface{ Scan(dest ...any) error }) (snapshotRow, error) {
	row := snapshotRow{}
	if err := scanner.Scan(&row.ID, &row.Kind, &row.ThreadID, &row.UpdatedAt, &row.UpdatedBy, &row.BodyJSON, &row.ProvenanceJSON); err != nil {
		return snapshotRow{}, fmt.Errorf("scan snapshot row: %w", err)
	}
	return row, nil
}

func (r snapshotRow) ToSnapshotMap() (map[string]any, error) {
	body := map[string]any{}
	if strings.TrimSpace(r.BodyJSON) != "" {
		if err := json.Unmarshal([]byte(r.BodyJSON), &body); err != nil {
			return nil, fmt.Errorf("decode snapshot body: %w", err)
		}
	}

	provenance := map[string]any{}
	if strings.TrimSpace(r.ProvenanceJSON) != "" {
		if err := json.Unmarshal([]byte(r.ProvenanceJSON), &provenance); err != nil {
			return nil, fmt.Errorf("decode snapshot provenance: %w", err)
		}
	}

	body["id"] = r.ID
	if _, hasType := body["type"]; !hasType {
		body["type"] = r.Kind
	}
	body["updated_at"] = r.UpdatedAt
	body["updated_by"] = r.UpdatedBy
	if r.ThreadID.Valid {
		body["thread_id"] = r.ThreadID.String
	}
	body["provenance"] = provenance

	return body, nil
}

func encodeContent(content any) ([]byte, error) {
	switch value := content.(type) {
	case string:
		return []byte(value), nil
	case []byte:
		return value, nil
	default:
		encoded, err := json.Marshal(value)
		if err != nil {
			return nil, fmt.Errorf("encode artifact content: %w", err)
		}
		return encoded, nil
	}
}

func containsThreadRef(refs []string, threadID string) bool {
	target := "thread:" + threadID
	for _, ref := range refs {
		if ref == target {
			return true
		}
	}
	return false
}

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func threadIsStale(thread map[string]any, now time.Time) bool {
	cadence, _ := thread["cadence"].(string)
	if cadence == "reactive" {
		return false
	}

	nextCheckInAt, _ := thread["next_check_in_at"].(string)
	if strings.TrimSpace(nextCheckInAt) == "" {
		return false
	}

	nextTime, err := time.Parse(time.RFC3339, nextCheckInAt)
	if err != nil {
		return false
	}

	return now.After(nextTime)
}

func cloneMap(in map[string]any) map[string]any {
	out := make(map[string]any, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}

func normalizeStringSlice(raw any) ([]string, error) {
	switch values := raw.(type) {
	case []string:
		out := make([]string, len(values))
		copy(out, values)
		return out, nil
	case []any:
		out := make([]string, 0, len(values))
		for _, value := range values {
			text, ok := value.(string)
			if !ok {
				return nil, fmt.Errorf("must contain only strings")
			}
			out = append(out, text)
		}
		return out, nil
	default:
		return nil, fmt.Errorf("must be a list of strings")
	}
}
