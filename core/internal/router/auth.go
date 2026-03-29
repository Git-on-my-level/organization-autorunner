package router

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const tokenSkew = 30 * time.Second

type AuthState struct {
	Username         string  `json:"username"`
	AgentID          string  `json:"agent_id"`
	ActorID          string  `json:"actor_id"`
	KeyID            string  `json:"key_id"`
	PublicKeyB64     string  `json:"public_key_b64"`
	PrivateKeyB64    string  `json:"private_key_b64"`
	AccessToken      string  `json:"access_token,omitempty"`
	RefreshToken     string  `json:"refresh_token,omitempty"`
	TokenType        string  `json:"token_type,omitempty"`
	ExpiresAtUnixSec float64 `json:"expires_at_unix_sec,omitempty"`
}

type AuthManager struct {
	baseURL    string
	httpClient *http.Client
	path       string

	mu    sync.Mutex
	state *AuthState
}

func NewAuthManager(baseURL string, httpClient *http.Client, path string) (*AuthManager, error) {
	manager := &AuthManager{
		baseURL:    strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		httpClient: httpClient,
		path:       strings.TrimSpace(path),
	}
	if manager.path == "" {
		return manager, nil
	}
	payload, err := os.ReadFile(manager.path)
	if err != nil {
		if os.IsNotExist(err) {
			return manager, nil
		}
		return nil, fmt.Errorf("read auth state: %w", err)
	}
	var state AuthState
	if err := json.Unmarshal(payload, &state); err != nil {
		return nil, fmt.Errorf("decode auth state: %w", err)
	}
	manager.state = &state
	return manager, nil
}

func (m *AuthManager) HasState() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state != nil && strings.TrimSpace(m.state.AgentID) != ""
}

func (m *AuthManager) ActorID() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state == nil {
		return ""
	}
	return strings.TrimSpace(m.state.ActorID)
}

func (m *AuthManager) Authorization(ctx context.Context) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state == nil {
		return "", nil
	}
	if strings.TrimSpace(m.state.AccessToken) != "" && time.Unix(int64(m.state.ExpiresAtUnixSec), 0).After(time.Now().Add(tokenSkew)) {
		return m.state.AccessToken, nil
	}
	if err := m.refreshLocked(ctx); err != nil {
		return "", err
	}
	return m.state.AccessToken, nil
}

func (m *AuthManager) Register(ctx context.Context, username string, bootstrapToken string, inviteToken string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if strings.TrimSpace(username) == "" {
		return fmt.Errorf("username is required to register router auth state")
	}
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return fmt.Errorf("generate ed25519 keypair: %w", err)
	}
	body := map[string]any{
		"username":   strings.TrimSpace(username),
		"public_key": base64.StdEncoding.EncodeToString(publicKey),
	}
	if strings.TrimSpace(bootstrapToken) != "" {
		body["bootstrap_token"] = strings.TrimSpace(bootstrapToken)
	}
	if strings.TrimSpace(inviteToken) != "" {
		body["invite_token"] = strings.TrimSpace(inviteToken)
	}
	var response struct {
		Agent struct {
			Username string `json:"username"`
			AgentID  string `json:"agent_id"`
			ActorID  string `json:"actor_id"`
		} `json:"agent"`
		Key struct {
			KeyID string `json:"key_id"`
		} `json:"key"`
		Tokens struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
			TokenType    string `json:"token_type"`
			ExpiresIn    int    `json:"expires_in"`
		} `json:"tokens"`
	}
	if err := doJSON(ctx, m.httpClient, http.MethodPost, m.baseURL+"/auth/agents/register", nil, body, &response); err != nil {
		return err
	}
	m.state = &AuthState{
		Username:         strings.TrimSpace(response.Agent.Username),
		AgentID:          strings.TrimSpace(response.Agent.AgentID),
		ActorID:          strings.TrimSpace(response.Agent.ActorID),
		KeyID:            strings.TrimSpace(response.Key.KeyID),
		PublicKeyB64:     base64.StdEncoding.EncodeToString(publicKey),
		PrivateKeyB64:    base64.StdEncoding.EncodeToString(privateKey),
		AccessToken:      strings.TrimSpace(response.Tokens.AccessToken),
		RefreshToken:     strings.TrimSpace(response.Tokens.RefreshToken),
		TokenType:        firstNonEmpty(strings.TrimSpace(response.Tokens.TokenType), "Bearer"),
		ExpiresAtUnixSec: float64(time.Now().Add(time.Duration(response.Tokens.ExpiresIn) * time.Second).Unix()),
	}
	return m.saveLocked()
}

func (m *AuthManager) refreshLocked(ctx context.Context) error {
	if m.state == nil {
		return nil
	}
	type tokenEnvelope struct {
		Tokens struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
			TokenType    string `json:"token_type"`
			ExpiresIn    int    `json:"expires_in"`
		} `json:"tokens"`
	}
	var response tokenEnvelope
	if strings.TrimSpace(m.state.RefreshToken) != "" {
		err := doJSON(ctx, m.httpClient, http.MethodPost, m.baseURL+"/auth/token", nil, map[string]any{
			"grant_type":    "refresh_token",
			"refresh_token": strings.TrimSpace(m.state.RefreshToken),
		}, &response)
		if err == nil {
			m.applyTokensLocked(response)
			return m.saveLocked()
		}
	}
	signedAt := time.Now().UTC().Format(time.RFC3339)
	message := fmt.Sprintf("oar-auth-token|%s|%s|%s", strings.TrimSpace(m.state.AgentID), strings.TrimSpace(m.state.KeyID), signedAt)
	privateBytes, err := base64.StdEncoding.DecodeString(strings.TrimSpace(m.state.PrivateKeyB64))
	if err != nil {
		return fmt.Errorf("decode router private key: %w", err)
	}
	if len(privateBytes) != ed25519.PrivateKeySize {
		return fmt.Errorf("invalid router private key length: %d", len(privateBytes))
	}
	signature := ed25519.Sign(ed25519.PrivateKey(privateBytes), []byte(message))
	if err := doJSON(ctx, m.httpClient, http.MethodPost, m.baseURL+"/auth/token", nil, map[string]any{
		"grant_type": "assertion",
		"agent_id":   strings.TrimSpace(m.state.AgentID),
		"key_id":     strings.TrimSpace(m.state.KeyID),
		"signed_at":  signedAt,
		"signature":  base64.StdEncoding.EncodeToString(signature),
	}, &response); err != nil {
		return err
	}
	m.applyTokensLocked(response)
	return m.saveLocked()
}

func (m *AuthManager) applyTokensLocked(response struct {
	Tokens struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		TokenType    string `json:"token_type"`
		ExpiresIn    int    `json:"expires_in"`
	} `json:"tokens"`
}) {
	m.state.AccessToken = strings.TrimSpace(response.Tokens.AccessToken)
	if refresh := strings.TrimSpace(response.Tokens.RefreshToken); refresh != "" {
		m.state.RefreshToken = refresh
	}
	m.state.TokenType = firstNonEmpty(strings.TrimSpace(response.Tokens.TokenType), "Bearer")
	m.state.ExpiresAtUnixSec = float64(time.Now().Add(time.Duration(response.Tokens.ExpiresIn) * time.Second).Unix())
}

func (m *AuthManager) saveLocked() error {
	if m.path == "" || m.state == nil {
		return nil
	}
	content, err := json.MarshalIndent(m.state, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal auth state: %w", err)
	}
	content = append(content, '\n')
	if err := os.MkdirAll(filepath.Dir(m.path), 0o700); err != nil {
		return fmt.Errorf("mkdir auth state dir: %w", err)
	}
	tmp := m.path + ".tmp"
	if err := os.WriteFile(tmp, content, 0o600); err != nil {
		return fmt.Errorf("write auth state: %w", err)
	}
	if err := os.Rename(tmp, m.path); err != nil {
		return fmt.Errorf("rename auth state: %w", err)
	}
	return os.Chmod(m.path, 0o600)
}

func stableHash(parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, "|")))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
