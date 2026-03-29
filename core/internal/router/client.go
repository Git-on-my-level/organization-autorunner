package router

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type AuthProvider interface {
	Authorization(ctx context.Context) (string, error)
	ActorID() string
}

type Client struct {
	baseURL    string
	httpClient *http.Client
	auth       AuthProvider
}

type EventStreamItem struct {
	ID   string
	Data string
}

type Error struct {
	StatusCode int
	Code       string
	Message    string
}

func (e *Error) Error() string {
	return e.Message
}

func NewHTTPClient(verifyTLS bool, timeout time.Duration) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if !verifyTLS {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
	}
}

func NewClient(baseURL string, httpClient *http.Client, auth AuthProvider) *Client {
	return &Client{
		baseURL:    strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		httpClient: httpClient,
		auth:       auth,
	}
}

func (c *Client) ListPrincipals(ctx context.Context, limit int) ([]map[string]any, error) {
	var response struct {
		Principals []map[string]any `json:"principals"`
	}
	params := url.Values{}
	params.Set("limit", fmt.Sprintf("%d", limit))
	if err := c.doJSON(ctx, http.MethodGet, "/auth/principals?"+params.Encode(), nil, &response); err != nil {
		return nil, err
	}
	return response.Principals, nil
}

func (c *Client) GetDocument(ctx context.Context, documentID string) (map[string]any, error) {
	var response map[string]any
	if err := c.doJSON(ctx, http.MethodGet, "/docs/"+url.PathEscape(documentID), nil, &response); err != nil {
		return nil, err
	}
	return response, nil
}

func (c *Client) GetEvent(ctx context.Context, eventID string) (map[string]any, error) {
	var response map[string]any
	if err := c.doJSON(ctx, http.MethodGet, "/events/"+url.PathEscape(eventID), nil, &response); err != nil {
		return nil, err
	}
	return response, nil
}

func (c *Client) GetThreadWorkspace(ctx context.Context, threadID string) (map[string]any, error) {
	var response map[string]any
	if err := c.doJSON(ctx, http.MethodGet, "/threads/"+url.PathEscape(threadID)+"/workspace", nil, &response); err != nil {
		return nil, err
	}
	return response, nil
}

func (c *Client) CreateArtifact(ctx context.Context, artifact map[string]any, content any, contentType string) error {
	body := map[string]any{
		"artifact":     artifact,
		"content":      content,
		"content_type": contentType,
	}
	if actorID := c.actorID(); actorID != "" {
		body["actor_id"] = actorID
	}
	return c.doJSON(ctx, http.MethodPost, "/artifacts", body, nil)
}

func (c *Client) CreateEvent(ctx context.Context, event map[string]any, requestKey string) error {
	body := map[string]any{
		"event": event,
	}
	if actorID := c.actorID(); actorID != "" {
		body["actor_id"] = actorID
	}
	if strings.TrimSpace(requestKey) != "" {
		body["request_key"] = strings.TrimSpace(requestKey)
	}
	return c.doJSON(ctx, http.MethodPost, "/events", body, nil)
}

func (c *Client) StreamEvents(ctx context.Context, eventType string, lastEventID string) (<-chan EventStreamItem, <-chan error) {
	items := make(chan EventStreamItem)
	errs := make(chan error, 1)
	go func() {
		defer close(items)
		defer close(errs)

		params := url.Values{}
		params.Add("type", eventType)
		if strings.TrimSpace(lastEventID) != "" {
			params.Set("last_event_id", strings.TrimSpace(lastEventID))
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/events/stream?"+params.Encode(), nil)
		if err != nil {
			errs <- err
			return
		}
		if strings.TrimSpace(lastEventID) != "" {
			req.Header.Set("Last-Event-ID", strings.TrimSpace(lastEventID))
		}
		if token, err := c.authorization(ctx); err != nil {
			errs <- err
			return
		} else if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		req.Header.Set("Accept", "text/event-stream")
		resp, err := c.httpClient.Do(req)
		if err != nil {
			errs <- err
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			errs <- decodeError(resp)
			return
		}

		reader := bufio.NewReader(resp.Body)
		for {
			event, err := readEvent(reader)
			if err != nil {
				if err == io.EOF || ctx.Err() != nil {
					return
				}
				errs <- err
				return
			}
			if strings.TrimSpace(event.Data) == "" {
				continue
			}
			select {
			case <-ctx.Done():
				return
			case items <- EventStreamItem{ID: event.ID, Data: event.Data}:
			}
		}
	}()
	return items, errs
}

func (c *Client) doJSON(ctx context.Context, method string, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")
	if token, err := c.authorization(ctx); err != nil {
		return err
	} else if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return decodeError(resp)
	}
	if out == nil {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (c *Client) authorization(ctx context.Context) (string, error) {
	if c.auth == nil {
		return "", nil
	}
	return c.auth.Authorization(ctx)
}

func (c *Client) actorID() string {
	if c.auth == nil {
		return ""
	}
	return strings.TrimSpace(c.auth.ActorID())
}

func doJSON(ctx context.Context, httpClient *http.Client, method string, rawURL string, headers map[string]string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, rawURL, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return decodeError(resp)
	}
	if out == nil {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func decodeError(resp *http.Response) error {
	body, _ := io.ReadAll(resp.Body)
	var payload struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &payload); err == nil && strings.TrimSpace(payload.Message) != "" {
		return &Error{StatusCode: resp.StatusCode, Code: strings.TrimSpace(payload.Code), Message: strings.TrimSpace(payload.Message)}
	}
	message := strings.TrimSpace(string(body))
	if message == "" {
		message = resp.Status
	}
	return &Error{StatusCode: resp.StatusCode, Code: "http_error", Message: message}
}

type sseEvent struct {
	ID   string
	Data string
}

func readEvent(reader *bufio.Reader) (sseEvent, error) {
	var event sseEvent
	var dataLines []string
	var sawField bool
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF && sawField {
				event.Data = strings.Join(dataLines, "\n")
				return event, nil
			}
			return sseEvent{}, err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if sawField {
				event.Data = strings.Join(dataLines, "\n")
				return event, nil
			}
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			key = line
			value = ""
		}
		value = strings.TrimPrefix(value, " ")
		sawField = true
		switch key {
		case "id":
			event.ID = value
		case "data":
			dataLines = append(dataLines, value)
		}
	}
}
