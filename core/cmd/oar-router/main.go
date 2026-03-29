package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"organization-autorunner-core/internal/router"
)

const (
	defaultRouterBaseURL       = "http://127.0.0.1:8000"
	defaultRouterWorkspaceID   = "ws_main"
	defaultRouterWorkspaceName = "Main"
)

func main() {
	var cfg router.Config
	cfg.BaseURL = envString("OAR_ROUTER_BASE_URL", defaultRouterBaseURL)
	cfg.WorkspaceID = envString("OAR_ROUTER_WORKSPACE_ID", defaultRouterWorkspaceID)
	cfg.WorkspaceName = envString("OAR_ROUTER_WORKSPACE_NAME", defaultRouterWorkspaceName)
	cfg.VerifyTLS = envBool("OAR_ROUTER_VERIFY_TLS", true)
	cfg.StatePath = envString("OAR_ROUTER_STATE_PATH", defaultRouterPath("router-state.json"))
	cfg.AuthStatePath = envString("OAR_ROUTER_AUTH_STATE_PATH", defaultRouterPath("router-auth.json"))
	cfg.Username = envString("OAR_ROUTER_USERNAME", "oar.router")
	cfg.BootstrapToken = envString("OAR_ROUTER_BOOTSTRAP_TOKEN", "")
	cfg.InviteToken = envString("OAR_ROUTER_INVITE_TOKEN", "")
	cfg.PrincipalCacheTTL = envDuration("OAR_ROUTER_PRINCIPAL_CACHE_TTL", time.Minute)
	cfg.ReconnectDelay = envDuration("OAR_ROUTER_RECONNECT_DELAY", 3*time.Second)

	flag.StringVar(&cfg.BaseURL, "base-url", cfg.BaseURL, "base URL for oar-core")
	flag.StringVar(&cfg.WorkspaceID, "workspace-id", cfg.WorkspaceID, "durable workspace id")
	flag.StringVar(&cfg.WorkspaceName, "workspace-name", cfg.WorkspaceName, "human-readable workspace name")
	flag.BoolVar(&cfg.VerifyTLS, "verify-tls", cfg.VerifyTLS, "verify TLS certificates for oar-core")
	flag.StringVar(&cfg.StatePath, "state-path", cfg.StatePath, "local router state path")
	flag.StringVar(&cfg.AuthStatePath, "auth-state-path", cfg.AuthStatePath, "local router auth state path")
	flag.StringVar(&cfg.Username, "username", cfg.Username, "service principal username used when bootstrapping router auth")
	flag.StringVar(&cfg.BootstrapToken, "bootstrap-token", cfg.BootstrapToken, "bootstrap token used to register router auth state if missing")
	flag.StringVar(&cfg.InviteToken, "invite-token", cfg.InviteToken, "invite token used to register router auth state if missing")
	flag.DurationVar(&cfg.PrincipalCacheTTL, "principal-cache-ttl", cfg.PrincipalCacheTTL, "how long to cache principal listings")
	flag.DurationVar(&cfg.ReconnectDelay, "reconnect-delay", cfg.ReconnectDelay, "delay before reconnecting the event stream after failure")
	flag.Parse()

	httpClient := router.NewHTTPClient(cfg.VerifyTLS, 60*time.Second)
	authManager, err := router.NewAuthManager(cfg.BaseURL, httpClient, cfg.AuthStatePath)
	if err != nil {
		fatalf("failed to initialize router auth: %v", err)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if !authManager.HasState() {
		if strings.TrimSpace(cfg.BootstrapToken) == "" && strings.TrimSpace(cfg.InviteToken) == "" {
			fatalf("router auth state is missing at %s and no bootstrap/invite token was provided", cfg.AuthStatePath)
		}
		if err := authManager.Register(ctx, cfg.Username, cfg.BootstrapToken, cfg.InviteToken); err != nil {
			fatalf("failed to register router auth state: %v", err)
		}
	}

	state, err := router.NewStateStore(cfg.StatePath)
	if err != nil {
		fatalf("failed to initialize router state: %v", err)
	}
	client := router.NewClient(cfg.BaseURL, httpClient, authManager)
	service := router.NewService(cfg, client, state)
	if err := service.Run(ctx); err != nil && err != context.Canceled {
		fatalf("router exited with error: %v", err)
	}
}

func defaultRouterPath(name string) string {
	workspaceRoot := envString("OAR_WORKSPACE_ROOT", ".oar-workspace")
	return filepath.Join(workspaceRoot, "router", name)
}

func envString(name string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func envBool(name string, fallback bool) bool {
	raw := strings.TrimSpace(strings.ToLower(os.Getenv(name)))
	switch raw {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	case "":
		return fallback
	default:
		return fallback
	}
}

func envDuration(name string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(raw)
	if err != nil {
		return fallback
	}
	return parsed
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
